import { invalidatePermissionCaches } from "../../auth/access.repository";
import { BadRequestError, NotFoundError } from "../../errors";
import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { scheduledScanQueue } from "../../infrastructure/queue/queues/scheduled-scan.queue";
import {
	fetchRelatedEntitiesByLibraryId,
	fetchRelatedEntitiesByLibraryPathId,
} from "../../infrastructure/search/search.document";
import {
	enqueueBulkEntitySync,
	enqueueSearchSync,
} from "../../infrastructure/search/search-sync.service";
import { logger } from "../../lib/logger";
import { removeConvertedFile } from "../../modules/conversion/converter";
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
	const metadataProviders = input.metadataProviders?.length
		? input.metadataProviders
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

	// Clean up converted files, sync search index, and delete orphaned entities
	await Promise.all([
		...books.map(({ id, uuid }) =>
			Promise.all([
				removeConvertedFile(uuid).catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Converted file cleanup failed",
					),
				),
				enqueueSearchSync(id, "delete").catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Search sync delete failed",
					),
				),
			]),
		),
		enqueueBulkEntitySync(relatedEntities).catch((err) =>
			logger.error({ err }, "[Library] Bulk entity sync failed"),
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
		metadataProviders?: string[];
		metadataConfig?: MetadataConfig;
	},
	serverId: string,
) => {
	const found = await libraryRepository.getIdAndMediaTypeByUuid(uuid, serverId);
	if (!found) throw new NotFoundError("Library not found");
	const { id, mediaType } = found;

	if (data.metadataProviders) {
		const allowed = allowedProvidersFor(mediaType);
		const invalid = data.metadataProviders.filter(
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

	// Clean up converted files, sync search index, and delete orphaned entities
	await Promise.all([
		...books.map(({ id, uuid }) =>
			Promise.all([
				removeConvertedFile(uuid).catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Converted file cleanup failed",
					),
				),
				enqueueSearchSync(id, "delete").catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Search sync delete failed",
					),
				),
			]),
		),
		enqueueBulkEntitySync(relatedEntities).catch((err) =>
			logger.error({ err }, "[Library] Bulk entity sync failed"),
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

/** Reject a second scan/reprocess of a library whose previous one still runs. */
const assertNoActiveTask = async (
	type: "library-scan" | "library-reprocess",
	libraryId: number,
	label: string,
) => {
	const tasks = await getActiveTasks();
	if (tasks.some((t) => t.type === type && t.libraryId === libraryId)) {
		throw new BadRequestError(`A ${label} is already running for this library`);
	}
};

export const scanLibrary = async (
	libraryUuid: string,
	serverId: string,
	userId?: string,
) => {
	const library = await libraryRepository.findByUuid(libraryUuid, serverId);
	if (!library) throw new NotFoundError("Library not found");

	// Disabled paths (isEnabled === false) are excluded; a null value means
	// "never configured" and is treated as enabled for backward compatibility.
	const paths = (library.paths ?? []).filter((p) => p.isEnabled !== false);
	if (paths.length === 0) {
		throw new BadRequestError("This library has no enabled paths to scan");
	}
	await assertNoActiveTask("library-scan", library.id, "scan");

	const task = await createTask({
		type: "library-scan",
		serverId,
		label: `Scanning ${library.name}`,
		userId,
		libraryId: library.id,
	});
	await scheduledScanQueue.add("library-scan", {
		op: "scan",
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

	const taskId =
		opts.taskId ??
		(
			await createTask({
				type: "library-scan",
				serverId: opts.serverId,
				label: `Scanning ${library.name}`,
				libraryId: library.id,
			})
		).id;

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
				);
			} catch (error) {
				if (error instanceof TaskCancelledError) throw error;
				logger.error(
					{ err: error, path: pathObj.path },
					"Error scanning library path",
				);
			}
		}
	} catch (error) {
		if (!(error instanceof TaskCancelledError)) throw error;
		logger.info({ taskId, libraryId: library.id }, "Library scan cancelled");
	} finally {
		// Every file event is enqueued: the task can now finish by counting.
		// (No-op on a cancelled task — finalize only seals running tasks.)
		await finalizeTask(taskId).catch((err) =>
			logger.error({ err, taskId }, "Failed to finalize scan task"),
		);
		// Catalog changed → refresh recommendations (debounced, after the
		// file-event pipeline has had time to drain).
		const { enqueuePostScanRebuild } = await import(
			"../../modules/recommendations/recommendation.scheduler"
		);
		await enqueuePostScanRebuild(opts.serverId);
	}
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
	await assertNoActiveTask("library-reprocess", library.id, "reprocess");

	const task = await createTask({
		type: "library-reprocess",
		serverId,
		label: `Reprocessing ${library.name}`,
		userId,
		libraryId: library.id,
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
