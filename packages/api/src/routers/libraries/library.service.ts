import { invalidatePermissionCaches } from "../../auth/access.repository";
import { BadRequestError, NotFoundError } from "../../errors";
import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { scheduledScanQueue } from "../../infrastructure/queue/queues/scheduled-scan.queue";
import {
	fetchRelatedEntitiesByLibraryId,
	fetchRelatedEntitiesByLibraryPathId,
} from "../../infrastructure/search/catalog-relations";
import { logger } from "../../lib/logger";
import { removeConvertedFile } from "../../modules/conversion/converter";
import { enqueueMetadataEnrichmentBulk } from "../../modules/metadataEnrichment/metadata-enrichment.admission";
import type { LibraryScanMode } from "../../modules/scanning/libraryScanner";
import { scanPathLibrary } from "../../modules/scanning/libraryScanner";
import {
	registerLibrarySchedule,
	unregisterLibrarySchedule,
} from "../../modules/scanning/scheduled-scan.scheduler";
import {
	createTask,
	finalizeTask,
	getActiveTasks,
	reserve,
	TaskCancelledError,
	throwIfTaskCancelled,
} from "../../modules/taskManager";
import { bookRepository } from "../books/book.repository";
import { bookMetadataRepository } from "../books/metadata/metadata.repository";
import {
	AUDIOBOOK_PROVIDER_IDS,
	allowedProvidersFor,
	type CreateLibraryInput,
	EBOOK_PROVIDER_IDS,
	type MetadataConfig,
	type MetadataProvidersConfig,
	profileInConfig,
	providersInConfig,
} from "./library.model";
import { libraryRepository } from "./library.repository";
import { pathAccess } from "./path-access";

export const createLibrary = async (
	input: Omit<CreateLibraryInput, "serverId" | "id" | "createdAt"> & {
		paths?: string[];
	},
	serverId: string,
	userId?: string,
) => {
	// Reject unreachable folders up front — otherwise the initial scan aborts
	// server-side and the user is left with an unexplained empty library.
	await pathAccess.assertAccessible(input.paths ?? []);
	// Without an explicit list the DB default is ebook-oriented, so apply the
	// media-type default here.
	const mediaType = input.mediaType ?? "ebook";
	const metadataProviders =
		providersInConfig(input.metadataProviders).length > 0
			? (input.metadataProviders as MetadataProvidersConfig)
			: mediaType === "audiobook"
				? [...AUDIOBOOK_PROVIDER_IDS]
				: [...EBOOK_PROVIDER_IDS];
	const created = await libraryRepository.create(
		{ ...input, metadataProviders },
		serverId,
	);
	// The accessible-library sets cached for reads must pick the new library up.
	invalidatePermissionCaches();
	await registerLibrarySchedule(
		created.id,
		serverId,
		input.isCronWatch ? input.scanIntervalMinutes : null,
	).catch((err) =>
		logger.error(
			{ err, libraryId: created.id },
			"[Library] Failed to register scan schedule",
		),
	);
	// A library created with folders starts its first scan right away, so it
	// doesn't sit empty until the user discovers "Scan now".
	const enabledPaths = (created.paths ?? []).filter(
		(p) => p.isEnabled !== false,
	);
	if (enabledPaths.length > 0) {
		try {
			const task = await createTask({
				type: "library-scan",
				serverId,
				label: `Scanning ${created.name}`,
				userId,
				libraryId: created.id,
				payload: {
					op: "scan",
					libraryId: created.id,
					serverId,
				},
			});
			await scheduledScanQueue.add("library-scan", {
				op: "scan",
				libraryId: created.id,
				serverId,
				taskId: task.id,
			});
		} catch (err) {
			logger.error(
				{ err, libraryId: created.id },
				"[Library] Failed to start the initial scan",
			);
		}
	}
	return created;
};

export const getLibraries = async (
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const libraries = await libraryRepository.findByOrganization(serverId);
	if (accessibleLibraryIds === "ALL") return libraries;
	const allowed = new Set(accessibleLibraryIds);
	return libraries.filter((l) => allowed.has(l.id));
};

export const getLibrariesOverview = async (
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const libraries =
		await libraryRepository.findOverviewByOrganization(serverId);
	const allowed =
		accessibleLibraryIds === "ALL" ? null : new Set(accessibleLibraryIds);
	const visible = allowed
		? libraries.filter((l) => allowed.has(l.id))
		: libraries;
	return visible.map(({ id: _id, ...rest }) => rest);
};

export const setAutoEnrichPaused = async (
	libraryUuid: string,
	paused: boolean,
	serverId: string,
) => {
	const updated = await libraryRepository.setAutoEnrichPaused(
		libraryUuid,
		paused,
		serverId,
	);
	if (!updated) throw new NotFoundError("Library not found");
	return { paused };
};

export const setAllAutoEnrichPaused = async (
	paused: boolean,
	serverId: string,
) => {
	const count = await libraryRepository.setAllAutoEnrichPaused(
		serverId,
		paused,
	);
	return { paused, count };
};

export const getLibraryById = async (
	id: number,
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	if (accessibleLibraryIds !== "ALL" && !accessibleLibraryIds.includes(id)) {
		throw new NotFoundError("Library not found");
	}
	const library = await libraryRepository.findById(id, serverId);
	if (!library) throw new NotFoundError("Library not found");
	return library;
};

export const getLibraryByUuid = async (
	uuid: string,
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const library = await libraryRepository.findByUuid(uuid, serverId);
	if (!library) throw new NotFoundError("Library not found");
	if (
		accessibleLibraryIds !== "ALL" &&
		!accessibleLibraryIds.includes(library.id)
	) {
		throw new NotFoundError("Library not found");
	}
	return library;
};

/**
 * Live health of every folder in a library: is it still there, is it readable,
 * and how much of the catalog came from it. Probing on read (instead of trusting
 * the last scan) means a folder that came back online clears itself as soon as
 * someone looks, and the verdict is persisted so the library list can warn
 * without re-probing the filesystem for every row.
 */
export const getLibraryPathHealth = async (
	libraryUuid: string,
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const library = await getLibraryByUuid(
		libraryUuid,
		serverId,
		accessibleLibraryIds,
	);
	const paths = library.paths ?? [];
	const counts = await libraryRepository.countBooksByPath(library.id);
	const bookCountByPath = new Map(
		counts
			.filter(
				(row): row is { pathId: number; bookCount: number } =>
					row.pathId !== null,
			)
			.map((row) => [row.pathId, row.bookCount]),
	);

	const probes = await Promise.all(
		paths.map(async (pathObj) => ({
			pathObj,
			probe: await pathAccess.probe(pathObj.path),
		})),
	);

	return probes.map(({ pathObj, probe }) => {
		// Persist the fresh verdict, but never let a write failure hide the answer.
		void libraryRepository
			.setPathHealth(pathObj.id, probe.state === "ok" ? null : probe.reason)
			.catch((err) =>
				logger.error(
					{ err, pathId: pathObj.id },
					"Failed to persist library path health",
				),
			);
		return {
			pathId: pathObj.id,
			path: pathObj.path,
			isEnabled: pathObj.isEnabled !== false,
			state: probe.state,
			reason: probe.state === "ok" ? null : probe.reason,
			bookCount: bookCountByPath.get(pathObj.id) ?? 0,
		};
	});
};

/**
 * Fresh unreachable-folder count per library, for the library list. The overview
 * reads the persisted verdict, which is only as new as the last scan or the last
 * time someone opened a library — so a drive that went offline an hour ago would
 * show no warning where the user looks first. Probes run in parallel and each one
 * is capped, so a dead mount costs one timeout, not a hung request.
 */
export const getLibraryFolderIssues = async (
	serverId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const libraries = await getLibraries(serverId, accessibleLibraryIds);
	const probes = await Promise.all(
		libraries.flatMap((lib) =>
			(lib.paths ?? [])
				.filter((p) => p.isEnabled !== false)
				.map(async (pathObj) => ({
					uuid: lib.uuid,
					pathId: pathObj.id,
					probe: await pathAccess.probe(pathObj.path),
				})),
		),
	);

	const unreachableByUuid = new Map(libraries.map((lib) => [lib.uuid, 0]));
	for (const { uuid, pathId, probe } of probes) {
		await libraryRepository
			.setPathHealth(pathId, probe.state === "ok" ? null : probe.reason)
			.catch((err) =>
				logger.error({ err, pathId }, "Failed to persist library path health"),
			);
		if (probe.state !== "ok") {
			unreachableByUuid.set(uuid, (unreachableByUuid.get(uuid) ?? 0) + 1);
		}
	}

	return [...unreachableByUuid].map(([uuid, unreachableCount]) => ({
		uuid,
		unreachableCount,
	}));
};

export const addPath = async (
	libraryUuid: string,
	path: string,
	serverId: string,
) => {
	const owned = await libraryRepository.findByUuid(libraryUuid, serverId);
	if (!owned) throw new NotFoundError("Library not found");
	await pathAccess.assertAccessible([path]);
	return await libraryRepository.addPath({
		libraryId: owned.id,
		path,
		isEnabled: true,
	});
};

export const setPathEnabled = async (
	pathId: number,
	enabled: boolean,
	serverId: string,
) => {
	const ownedLibraryId = await libraryRepository.findLibraryIdForPath(
		pathId,
		serverId,
	);
	if (!ownedLibraryId) throw new NotFoundError("Path not found");
	const updated = await libraryRepository.setPathEnabled(pathId, enabled);
	if (!updated) throw new NotFoundError("Path not found");
	return updated;
};

export const removePath = async (pathId: number, serverId: string) => {
	const ownedLibraryId = await libraryRepository.findLibraryIdForPath(
		pathId,
		serverId,
	);
	if (!ownedLibraryId)
		throw new NotFoundError("Path not found or already deleted");

	// Fetch related entities and book IDs before cascade delete
	const [relatedEntities, books] = await Promise.all([
		fetchRelatedEntitiesByLibraryPathId(pathId),
		bookRepository.getIdsByLibraryPathId(pathId),
	]);

	const deleted = await libraryRepository.removePath(pathId);
	if (!deleted) throw new NotFoundError("Path not found or already deleted");

	// Clean up converted files and delete orphaned entities.
	await Promise.all([
		...books.map(({ id, uuid }) =>
			removeConvertedFile(uuid).catch((err) =>
				logger.error(
					{ err, bookId: id },
					"[Library] Converted file cleanup failed",
				),
			),
		),
		...relatedEntities.authorIds.map((id) =>
			bookMetadataRepository
				.deleteAuthorIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, authorId: id },
						"[Library] Orphan author cleanup failed",
					),
				),
		),
		...relatedEntities.seriesIds.map((id) =>
			bookMetadataRepository
				.deleteSeriesIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, seriesId: id },
						"[Library] Orphan series cleanup failed",
					),
				),
		),
	]);

	return { success: true };
};

export const updateLibrary = async (
	uuid: string,
	data: {
		name?: string;
		isCronWatch?: boolean;
		scanIntervalMinutes?: number | null;
		isPublic?: boolean;
		automaticGroupingEnabled?: boolean;
		metadataProviders?: MetadataProvidersConfig;
		metadataConfig?: MetadataConfig;
	},
	serverId: string,
) => {
	const found = await libraryRepository.getIdAndMediaTypeByUuid(uuid, serverId);
	if (!found) throw new NotFoundError("Library not found");
	const { id, mediaType } = found;

	if (data.metadataProviders) {
		if (mediaType === "audiobook" && profileInConfig(data.metadataProviders)) {
			throw new BadRequestError(
				"Metadata profiles are currently available for ebook libraries",
			);
		}
		const allowed = allowedProvidersFor(mediaType);
		const invalid = providersInConfig(data.metadataProviders).filter(
			(provider) => !allowed.includes(provider),
		);
		if (invalid.length > 0) {
			throw new BadRequestError(
				`Providers not valid for ${mediaType} libraries: ${invalid.join(", ")}`,
			);
		}
	}

	const updated = await libraryRepository.update(id, data, serverId);
	if (!updated) throw new NotFoundError("Library not found");
	// Turning grouping off takes effect immediately for automatic groups. Rows
	// explicitly grouped by a person are locked and intentionally preserved.
	if (data.automaticGroupingEnabled === false) {
		await bookRepository.clearAutomaticDuplicatePointersByLibrary(id);
	}
	// Reconcile the repeatable scan from the freshly persisted state.
	await registerLibrarySchedule(
		updated.id,
		serverId,
		updated.isCronWatch ? updated.scanIntervalMinutes : null,
	).catch((err) =>
		logger.error(
			{ err, libraryId: updated.id },
			"[Library] Failed to update scan schedule",
		),
	);
	// Enabling the setting also restores groups for books already in the
	// catalog. If another maintenance task is active, future book processing
	// still honors the enabled flag and the user can rebuild editions later.
	if (data.automaticGroupingEnabled === true && mediaType === "ebook") {
		await regroupLibrary(uuid, serverId).catch((err) =>
			logger.error(
				{ err, libraryId: updated.id },
				"[Library] Failed to start edition group rebuild",
			),
		);
	}
	return updated;
};

export const deleteLibrary = async (libraryUuid: string, serverId: string) => {
	const owned = await libraryRepository.findByUuid(libraryUuid, serverId);
	if (!owned) throw new NotFoundError("Library not found or already deleted");
	const libraryId = owned.id;

	// Fetch related entities and book IDs before cascade delete
	const [relatedEntities, books] = await Promise.all([
		fetchRelatedEntitiesByLibraryId(libraryId),
		bookRepository.getIdsByLibraryId(libraryId),
	]);

	const deleted = await libraryRepository.delete(libraryId, serverId);
	if (!deleted) throw new NotFoundError("Library not found or already deleted");
	invalidatePermissionCaches();

	await unregisterLibrarySchedule(libraryId).catch((err) =>
		logger.error(
			{ err, libraryId },
			"[Library] Failed to remove scan schedule",
		),
	);

	// Clean up converted files and delete orphaned entities.
	await Promise.all([
		...books.map(({ id, uuid }) =>
			removeConvertedFile(uuid).catch((err) =>
				logger.error(
					{ err, bookId: id },
					"[Library] Converted file cleanup failed",
				),
			),
		),
		...relatedEntities.authorIds.map((id) =>
			bookMetadataRepository
				.deleteAuthorIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, authorId: id },
						"[Library] Orphan author cleanup failed",
					),
				),
		),
		...relatedEntities.seriesIds.map((id) =>
			bookMetadataRepository
				.deleteSeriesIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, seriesId: id },
						"[Library] Orphan series cleanup failed",
					),
				),
		),
	]);

	return { success: true };
};

// Scans and reprocesses run as jobs on the scheduled-scan queue (worker
// process): the API request only creates the task and enqueues, so heavy
// producer work never runs in the API process, survives restarts via BullMQ's
// stalled-job retry, and stops early at cancellation checkpoints. Queue
// concurrency is 1, which also guarantees two scans of one library (dedupe is
// library-wide) can never run concurrently.

// These operations all change metadata or duplicate pointers. Running two for
// one library would make a from-scratch regroup race an enrich/reprocess job.
const EXCLUSIVE_LIBRARY_TASKS = new Set([
	"library-scan",
	"library-reprocess",
	"library-regroup",
	"library-enrich",
	"metadata-enrich-auto",
]);

const assertNoActiveLibraryMaintenance = async (libraryId: number) => {
	const tasks = await getActiveTasks();
	if (
		tasks.some(
			(t) => t.libraryId === libraryId && EXCLUSIVE_LIBRARY_TASKS.has(t.type),
		)
	) {
		throw new BadRequestError(
			"Another maintenance task is already running for this library",
		);
	}
};

export const scanLibrary = async (
	libraryUuid: string,
	serverId: string,
	userId?: string,
	mode: LibraryScanMode = "incremental",
) => {
	const library = await libraryRepository.findByUuid(libraryUuid, serverId);
	if (!library) throw new NotFoundError("Library not found");

	// Disabled paths (isEnabled === false) are excluded; a null value means
	// "never configured" and is treated as enabled for backward compatibility.
	const paths = (library.paths ?? []).filter((p) => p.isEnabled !== false);
	if (paths.length === 0) {
		throw new BadRequestError("This library has no enabled paths to scan");
	}
	await assertNoActiveLibraryMaintenance(library.id);

	const task = await createTask({
		type: "library-scan",
		serverId,
		label: `Scanning ${library.name}`,
		userId,
		libraryId: library.id,
		payload: {
			op: "scan",
			mode,
			libraryId: library.id,
			serverId,
		},
	});
	await scheduledScanQueue.add("library-scan", {
		op: "scan",
		mode,
		libraryId: library.id,
		serverId,
		taskId: task.id,
	});

	return { success: true, message: "Library scan started" };
};

/**
 * Executes a library scan; called from the scheduled-scan worker. Scheduled
 * jobs carry no taskId, so the task is created here in that case.
 */
export const runLibraryScan = async (opts: {
	libraryId: number;
	serverId: string;
	taskId?: string;
	mode?: LibraryScanMode;
	/** Persist a task created for a scheduled job so retries reuse its identity. */
	persistTaskId?: (taskId: string) => Promise<void>;
}) => {
	const library = await libraryRepository.findById(
		opts.libraryId,
		opts.serverId,
	);
	if (!library) {
		// Deleted between enqueue and run — close the task instead of failing.
		if (opts.taskId) await finalizeTask(opts.taskId).catch(() => {});
		return;
	}

	const paths = (library.paths ?? []).filter((p) => p.isEnabled !== false);
	if (paths.length === 0) {
		if (opts.taskId) await finalizeTask(opts.taskId).catch(() => {});
		return;
	}

	let taskId = opts.taskId;
	if (!taskId) {
		taskId = (
			await createTask({
				type: "library-scan",
				serverId: opts.serverId,
				label: `Scanning ${library.name}`,
				libraryId: library.id,
				payload: {
					op: "scan",
					mode: opts.mode ?? "full",
					libraryId: opts.libraryId,
					serverId: opts.serverId,
				},
			})
		).id;
		await opts.persistTaskId?.(taskId);
	}
	const pathErrors: Error[] = [];

	try {
		// Sequential on purpose: dedupe runs library-wide, so two paths of the
		// same library must not be scanned concurrently.
		for (const pathObj of paths) {
			try {
				await scanPathLibrary(
					pathObj.path,
					library.id,
					pathObj.id,
					taskId,
					library.mediaType,
					opts.mode ?? "full",
				);
				await libraryRepository.setPathHealth(pathObj.id, null);
			} catch (error) {
				if (error instanceof TaskCancelledError) throw error;
				pathErrors.push(
					error instanceof Error ? error : new Error(String(error)),
				);
				logger.error(
					{ err: error, path: pathObj.path },
					"Error scanning library path",
				);
				// Persist the failure: an unmounted or unreadable folder silently
				// stops the catalog from growing, and a log line nobody reads is not
				// a good enough answer for "why are my new books missing?".
				await libraryRepository
					.setPathHealth(
						pathObj.id,
						error instanceof Error ? error.message : String(error),
					)
					.catch((healthErr) =>
						logger.error(
							{ err: healthErr, pathId: pathObj.id },
							"Failed to record library path health",
						),
					);
			}
		}
	} catch (error) {
		if (!(error instanceof TaskCancelledError)) throw error;
		logger.info({ taskId, libraryId: library.id }, "Library scan cancelled");
		await finalizeTask(taskId).catch((err) =>
			logger.error({ err, taskId }, "Failed to finalize scan task"),
		);
		return;
	}

	if (pathErrors.length > 0) {
		throw new AggregateError(
			pathErrors,
			`Library scan incomplete: ${pathErrors.map((error) => error.message).join("; ")}`,
		);
	}

	// Every file event is enqueued: the task can now finish by counting.
	await finalizeTask(taskId).catch((err) =>
		logger.error({ err, taskId }, "Failed to finalize scan task"),
	);
	await libraryRepository
		.setLastScannedAt(library.id)
		.catch((err) =>
			logger.error({ err, libraryId: library.id }, "Failed to stamp last scan"),
		);
	// Catalog changed → refresh recommendations (debounced, after the
	// file-event pipeline has had time to drain).
	const { enqueuePostScanRebuild } = await import(
		"../../modules/recommendations/recommendation.scheduler"
	);
	await enqueuePostScanRebuild(opts.serverId);
};

const REPROCESS_BATCH_SIZE = 10000;

// Re-run the per-book pipeline (local metadata fill-missing, duplicate
// grouping, pending enrichment, search sync) over a library's existing books,
// skipping the expensive part of a scan: the fs walk and per-file hashing.
export const reprocessLibrary = async (
	libraryUuid: string,
	serverId: string,
	userId?: string,
) => {
	const library = await libraryRepository.findByUuid(libraryUuid, serverId);
	if (!library) throw new NotFoundError("Library not found");
	if (library.mediaType === "audiobook") {
		throw new BadRequestError("Audiobook libraries cannot be reprocessed");
	}
	await assertNoActiveLibraryMaintenance(library.id);

	const task = await createTask({
		type: "library-reprocess",
		serverId,
		label: `Reprocessing ${library.name}`,
		userId,
		libraryId: library.id,
		payload: {
			op: "reprocess",
			libraryId: library.id,
			serverId,
		},
	});
	await scheduledScanQueue.add("library-reprocess", {
		op: "reprocess",
		libraryId: library.id,
		serverId,
		taskId: task.id,
	});

	return { success: true, message: "Library reprocess started" };
};

/** Enqueues the reprocess jobs; called from the scheduled-scan worker. */
export const runLibraryReprocess = async (opts: {
	libraryId: number;
	taskId: string;
}) => {
	const { libraryId, taskId } = opts;
	let lastId = 0;
	try {
		while (true) {
			await throwIfTaskCancelled(taskId);
			const books = await bookRepository.listEbookIdsByLibraryAfter(
				libraryId,
				lastId,
				REPROCESS_BATCH_SIZE,
			);
			const lastBook = books.at(-1);
			if (!lastBook) break;
			lastId = lastBook.id;

			// Reserve before enqueuing so the task can't transiently look complete
			// while the producer is still creating jobs.
			await reserve(taskId, books.length);
			await fileEventQueue.addBulk(
				books.map((b) => ({
					name: "file-event",
					data: {
						action: "reprocess",
						bookId: b.id,
						uuid: b.uuid,
						libraryId,
						taskId,
					},
				})),
			);
		}
	} catch (error) {
		if (error instanceof TaskCancelledError) {
			logger.info({ taskId, libraryId }, "Library reprocess cancelled");
		} else {
			logger.error({ err: error, libraryId }, "Error enqueuing reprocess jobs");
		}
	} finally {
		await finalizeTask(taskId).catch((err) =>
			logger.error({ err, taskId }, "Failed to finalize reprocess task"),
		);
	}
};

// Rebuild automatic edition groups from the metadata already stored in the
// database. Unlike reprocess, this never opens source files or calls providers.
export const regroupLibrary = async (
	libraryUuid: string,
	serverId: string,
	userId?: string,
) => {
	const library = await libraryRepository.findByUuid(libraryUuid, serverId);
	if (!library) throw new NotFoundError("Library not found");
	if (library.mediaType === "audiobook") {
		throw new BadRequestError("Audiobook libraries cannot be regrouped");
	}
	await assertNoActiveLibraryMaintenance(library.id);

	const task = await createTask({
		type: "library-regroup",
		serverId,
		label: `Rebuilding edition groups for ${library.name}`,
		userId,
		libraryId: library.id,
		payload: {
			op: "regroup",
			libraryId: library.id,
			serverId,
		},
	});
	await scheduledScanQueue.add("library-regroup", {
		op: "regroup",
		libraryId: library.id,
		serverId,
		taskId: task.id,
	});

	return { success: true, message: "Library edition rebuild started" };
};

/** Clears automatic links once, then fans out DB-only regroup jobs. */
export const runLibraryRegroup = async (opts: {
	libraryId: number;
	taskId: string;
}) => {
	const { libraryId, taskId } = opts;
	let lastId = 0;
	try {
		await throwIfTaskCancelled(taskId);
		await bookRepository.clearAutomaticDuplicatePointersByLibrary(libraryId);

		while (true) {
			await throwIfTaskCancelled(taskId);
			const books = await bookRepository.listEbookIdsByLibraryAfter(
				libraryId,
				lastId,
				REPROCESS_BATCH_SIZE,
			);
			const lastBook = books.at(-1);
			if (!lastBook) break;
			lastId = lastBook.id;

			await reserve(taskId, books.length);
			await fileEventQueue.addBulk(
				books.map((b) => ({
					name: "file-event",
					data: {
						action: "regroup",
						bookId: b.id,
						libraryId,
						taskId,
					},
				})),
			);
		}
	} catch (error) {
		if (error instanceof TaskCancelledError) {
			logger.info({ taskId, libraryId }, "Library edition rebuild cancelled");
		} else {
			logger.error({ err: error, libraryId }, "Error enqueuing regroup jobs");
		}
	} finally {
		await finalizeTask(taskId).catch((err) =>
			logger.error({ err, taskId }, "Failed to finalize regroup task"),
		);
	}
};

// Provider-only pass: fan out one refresh-enrich job per ebook so providers
// are re-consulted and fresh values replace stale DB data (locks still win).
// Lighter than a reprocess — no local re-extract, regroup or search resync.
export const enrichLibrary = async (
	libraryUuid: string,
	serverId: string,
	userId?: string,
) => {
	const library = await libraryRepository.findByUuid(libraryUuid, serverId);
	if (!library) throw new NotFoundError("Library not found");
	if (library.mediaType === "audiobook") {
		throw new BadRequestError("Audiobook libraries cannot be re-enriched");
	}
	await assertNoActiveLibraryMaintenance(library.id);

	const task = await createTask({
		type: "library-enrich",
		serverId,
		label: `Refreshing metadata for ${library.name}`,
		userId,
		libraryId: library.id,
		payload: {
			op: "enrich",
			libraryId: library.id,
			serverId,
		},
	});
	await scheduledScanQueue.add("library-enrich", {
		op: "enrich",
		libraryId: library.id,
		serverId,
		taskId: task.id,
	});

	return { success: true, message: "Library metadata refresh started" };
};

/** Enqueues the refresh-enrich jobs; called from the scheduled-scan worker. */
export const runLibraryEnrich = async (opts: {
	libraryId: number;
	taskId: string;
}) => {
	const { libraryId, taskId } = opts;
	let lastId = 0;
	try {
		while (true) {
			await throwIfTaskCancelled(taskId);
			const books = await bookRepository.listEbookIdsByLibraryAfter(
				libraryId,
				lastId,
				REPROCESS_BATCH_SIZE,
			);
			const lastBook = books.at(-1);
			if (!lastBook) break;
			lastId = lastBook.id;

			await reserve(taskId, books.length);
			await enqueueMetadataEnrichmentBulk(
				books.map((b) => ({
					bookId: b.id,
					uuid: b.uuid,
					taskId,
					refresh: true,
				})),
			);
		}
	} catch (error) {
		if (error instanceof TaskCancelledError) {
			logger.info({ taskId, libraryId }, "Library metadata refresh cancelled");
		} else {
			logger.error({ err: error, libraryId }, "Error enqueuing enrich jobs");
		}
	} finally {
		await finalizeTask(taskId).catch((err) =>
			logger.error({ err, taskId }, "Failed to finalize enrich task"),
		);
	}
};
