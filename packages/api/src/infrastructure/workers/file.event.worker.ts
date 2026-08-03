import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { TtlPromiseCache } from "../../lib/ttl-promise-cache";
import {
	fileEventConcurrency,
	workerConcurrency,
} from "../../lib/worker-budget";
import {
	type AudiobookJobData,
	processAudiobook,
} from "../../modules/audiobookProcessor";
import {
	enqueueBookEnrich,
	findMemberToPromote,
	regroupBookDuplicates,
} from "../../modules/duplicateGrouping";
import { enqueueMetadataEnrichment } from "../../modules/metadataEnrichment/metadata-enrichment.admission";
import { scannedFileRepository } from "../../modules/scanning/scannedFile.repository";
import { getEbookMediaType } from "../../modules/scanning/supportedExtensions";
import {
	getOrCreateScanEnrichTask,
	isTaskCancelled,
	reserve,
} from "../../modules/taskManager";
import { bookRepository } from "../../routers/books/book.repository";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { enrichmentStateRepository } from "../../routers/enrichment/enrichment.repository";
import { libraryRepository } from "../../routers/libraries/library.repository";
import { generateDeterministicUUID } from "../../utils/misc";
import { redis } from "../queue/redis";
import { fetchBookRelatedEntities } from "../search/catalog-relations";

const log = logger.child({ component: "file-event-worker" });

const CONCURRENCY = fileEventConcurrency();
export const fileEventMaximumConcurrency = workerConcurrency();

log.info(
	{ concurrency: CONCURRENCY, maximumConcurrency: fileEventMaximumConcurrency },
	"Starting",
);

// A library's server (better-auth org) never changes, so cache the lookup to
// avoid a query per job.
const serverIdByLibrary = new Map<number, string | null>();

// Auto-enrich pause is user-toggleable mid-scan, so cache it only briefly to
// keep the per-book lookup off the hot path without ignoring a fresh pause.
// Promise-keyed: this worker's concurrency scales with CPU count, so the jobs
// racing on one library share a single lookup instead of one query each.
const pauseByLibrary = new TtlPromiseCache<string | null>(30_000, 500);

async function isAutoEnrichPaused(libraryId: number): Promise<boolean> {
	const pausedAt = await pauseByLibrary.get(String(libraryId), () =>
		libraryRepository.getAutoEnrichPausedAt(libraryId),
	);
	return pausedAt != null;
}
async function resolveServerId(libraryId: number): Promise<string | null> {
	const cached = serverIdByLibrary.get(libraryId);
	if (cached !== undefined) return cached;
	const serverId = await libraryRepository.getServerIdByLibraryId(libraryId);
	serverIdByLibrary.set(libraryId, serverId);
	return serverId;
}

/** Queue a background metadata-enrich job under this scan's own enrich task. */
async function enqueueAutoEnrich(
	scanTaskId: string | undefined,
	serverId: string | null,
	name: "enrich-book" | "enrich-audiobook",
	bookId: number,
	uuid: string,
	libraryId: number,
	opts?: { force?: boolean },
): Promise<void> {
	// No scan task or server means there's no enrich task to attribute this to.
	if (!scanTaskId || !serverId) return;
	// Library paused: skip automatic enrichment. A manual retry or resume reopens
	// the book later; the scan still records it, so nothing is lost.
	if (await isAutoEnrichPaused(libraryId)) return;
	const enrichTaskId = await getOrCreateScanEnrichTask(scanTaskId, serverId);
	// Null means the scan already finished (this job was in flight when it did);
	// enriching under a task nobody will seal would leave it running forever.
	if (!enrichTaskId) return;
	// Reserve before enqueuing so the enrich task's total can't transiently look
	// complete while the scan is still discovering books.
	await reserve(enrichTaskId, 1);
	await enqueueMetadataEnrichment({
		bookId,
		uuid,
		mediaType: name === "enrich-audiobook" ? "audiobook" : "ebook",
		taskId: enrichTaskId,
		...(opts?.force && { force: true }),
	}).catch((err) =>
		log.error({ err, bookId }, "Metadata enrich enqueue failed"),
	);
}

// A book row can exist while its processing never finished (crash, failed
// job) and has no metadata yet. Such books must be repaired on rescan instead
// of skipped as "already_exists".
async function isBookFullyProcessed(book: {
	id: number;
	uuid: string;
}): Promise<boolean> {
	if (!(await bookMetadataRepository.findByBookId(book.id))) return false;
	return true;
}

async function handleFileEvent(job: Job) {
	const {
		action,
		filename,
		fileHash,
		path,
		lastModified,
		size,
		relativePath,
		libraryId,
		libraryPathId,
		taskId,
	} = job.data;

	try {
		if (taskId && (await isTaskCancelled(taskId))) {
			return { path, action, skipped: "cancelled" };
		}
		const serverId = await resolveServerId(libraryId);
		if (action === "add") {
			// A book already at this path means either the file was modified on
			// disk (update it in place) or a previous run died mid-processing
			// (repair it) — never insert a second book.
			const existingBook = await bookRepository.getByRelativePath(
				relativePath,
				libraryPathId,
			);
			if (existingBook) {
				const sameContent = existingBook.filehash === fileHash;
				if (sameContent && (await isBookFullyProcessed(existingBook))) {
					await scannedFileRepository.markDone(path, libraryPathId);
					return { path, action, skipped: "already_exists" };
				}

				if (!sameContent) {
					const updated = await bookRepository.updateFileInfo(existingBook.id, {
						filehash: fileHash,
						filesizeKb: Math.round(size / 1024),
						lastModified,
					});
					if (!updated) {
						// The new content matches another book in the library — the next
						// scan will mark this file as duplicate and clean it up.
						await scannedFileRepository.markDone(path, libraryPathId);
						return { path, action, skipped: "duplicate_content" };
					}
				}

				await bookMetadataService.enrichAndSaveMetadata({
					bookId: existingBook.id,
					uuid: existingBook.uuid,
					filePath: path,
				});
				await regroupBookDuplicates(existingBook.id).catch((err) =>
					log.error({ err, bookId: existingBook.id }, "Regroup failed"),
				);
				await scannedFileRepository.markDone(path, libraryPathId);
				return { path, action, updated: !sameContent, repaired: sameContent };
			}

			const uuid = generateDeterministicUUID(filename, fileHash);

			const bookInserted = await bookRepository.create({
				uuid,
				filename: filename,
				filehash: fileHash,
				libraryId: libraryId,
				libraryPathId: libraryPathId,
				relativePath: relativePath,
				filesizeKb: Math.round(size / 1024),
				lastModified: lastModified,
				mediaType: getEbookMediaType(filename),
			});

			// Book already exists (ON CONFLICT DO NOTHING returned undefined) — skip all heavy work
			if (!bookInserted) {
				await scannedFileRepository.markDone(path, libraryPathId);
				return { path, action, skipped: "already_exists" };
			}

			// Verify book still exists (may have been deleted by a concurrent worker)
			const stillExists = await bookRepository.getById(bookInserted.id);
			if (!stillExists) {
				await scannedFileRepository.markDone(path, libraryPathId);
				return { path, action, skipped: "deleted_during_processing" };
			}

			await bookMetadataService.enrichAndSaveMetadata({
				bookId: bookInserted.id,
				uuid: bookInserted.uuid,
				filePath: path,
			});

			// Group by ISBN before enrichment: if this book becomes a hidden
			// copy, the enrich worker will skip it (one source of truth).
			await regroupBookDuplicates(bookInserted.id).catch((err) =>
				log.error({ err, bookId: bookInserted.id }, "Regroup failed"),
			);

			// Enqueue Amazon metadata enrichment in background (non-blocking)
			await enqueueAutoEnrich(
				taskId,
				serverId,
				"enrich-book",
				bookInserted.id,
				bookInserted.uuid,
				libraryId,
			);

			await scannedFileRepository.markDone(path, libraryPathId);
		} else if (action === "regroup") {
			// DB-only edition rebuild. The producer has already exposed every
			// automatic member; running the normal matcher for each book rebuilds
			// deterministic groups without opening the source EPUB or consulting
			// metadata providers. Errors must reach BullMQ so retries/progress are
			// accurate instead of silently reporting a successful rebuild.
			const bookId = job.data.bookId as number;
			await regroupBookDuplicates(bookId);
			return { action, bookId };
		} else if (action === "reprocess") {
			// Reprocess an already-scanned ebook: no fs walk/hash — re-extract local
			// metadata (fill-missing), regroup, retry pending enrichment, resync.
			const bookId = job.data.bookId as number;
			const bookRow = await bookRepository.getById(bookId);
			if (!bookRow) {
				return { action, bookId, skipped: "book_missing" };
			}

			if (await bookMetadataRepository.findByBookId(bookId)) {
				await bookMetadataService.fillMissingFromLocal({
					bookId,
					uuid: bookRow.uuid,
				});
			} else {
				// Never-processed book (crashed scan): full local extraction, same as
				// the scan repair path.
				await bookMetadataService.enrichAndSaveMetadata({
					bookId,
					uuid: bookRow.uuid,
				});
			}

			await regroupBookDuplicates(bookId).catch((err) =>
				log.error({ err, bookId }, "Regroup failed"),
			);

			// Hidden copies aren't enriched (one source of truth). For the rest,
			// re-enqueue whenever a configured provider could still fill a missing
			// field — the "already enriched" flag alone must not block a retry
			// (RanobeDB may have run while Amazon failed or was disabled). force
			// bypasses the enrich worker's already-enriched skip.
			const isHidden = (await bookRepository.getById(bookId))
				?.duplicateOfBookId;
			if (
				!isHidden &&
				(await bookMetadataService.needsExternalEnrichment(bookId))
			) {
				await enqueueAutoEnrich(
					taskId,
					serverId,
					"enrich-book",
					bookId,
					bookRow.uuid,
					libraryId,
					{ force: true },
				);
			}

			return { action, bookId };
		} else if (action === "add-audiobook") {
			const audioData = job.data as AudiobookJobData;

			const markAudioFilesDone = async () => {
				for (const af of audioData.audioFiles) {
					await scannedFileRepository.markDone(af.path, libraryPathId);
				}
			};

			// Same as ebooks: a modified audiobook updates the existing book, and
			// a half-processed one (no metadata yet) gets repaired.
			const existingBook = await bookRepository.getByRelativePath(
				relativePath,
				libraryPathId,
			);
			if (existingBook) {
				const sameContent = existingBook.filehash === fileHash;
				if (
					sameContent &&
					(await bookMetadataRepository.findByBookId(existingBook.id))
				) {
					await markAudioFilesDone();
					return { path: relativePath, action, skipped: "already_exists" };
				}

				let updated = true;
				if (!sameContent) {
					updated = !!(await bookRepository.updateFileInfo(existingBook.id, {
						filehash: fileHash,
						filesizeKb: Math.round(size / 1024),
						lastModified,
					}));
				}
				if (updated) {
					await processAudiobook(existingBook.id, existingBook.uuid, audioData);
				}
				await markAudioFilesDone();
				return { path: relativePath, action, updated };
			}

			const uuid = generateDeterministicUUID(filename, fileHash);

			const bookInserted = await bookRepository.create({
				uuid,
				filename,
				filehash: fileHash,
				libraryId,
				libraryPathId,
				relativePath,
				filesizeKb: Math.round(size / 1024),
				lastModified,
				mediaType: "audio/mp4",
			});

			if (!bookInserted) {
				await markAudioFilesDone();
				return { path: relativePath, action, skipped: "already_exists" };
			}

			// Verify book still exists (may have been deleted by a concurrent worker)
			const stillExists = await bookRepository.getById(bookInserted.id);
			if (!stillExists) {
				await markAudioFilesDone();
				return {
					path: relativePath,
					action,
					skipped: "deleted_during_processing",
				};
			}

			await processAudiobook(bookInserted.id, bookInserted.uuid, audioData);

			// Enqueue Audible metadata enrichment in background (non-blocking)
			await enqueueAutoEnrich(
				taskId,
				serverId,
				"enrich-audiobook",
				bookInserted.id,
				bookInserted.uuid,
				libraryId,
			);

			await markAudioFilesDone();
		} else if (action === "delete") {
			// Get the book before deleting so related files and entities can be cleaned.
			const existing = await bookRepository.getByRelativePath(
				relativePath,
				libraryPathId,
			);
			// Fetch related entities before deleting the book
			const relatedEntities = existing
				? await fetchBookRelatedEntities(existing.id).catch(() => undefined)
				: undefined;
			// Capture a member to promote before the FK clears the pointers.
			const promote = existing
				? await findMemberToPromote(existing.id).catch(() => null)
				: null;

			await bookRepository.removeBookByRelativePath(
				relativePath,
				libraryPathId,
			);
			if (promote) {
				// Re-form the group around the surviving copy and enrich it, since
				// it was a hidden copy until now (one source of truth).
				await regroupBookDuplicates(promote.id).catch((err) =>
					log.error({ err, bookId: promote.id }, "Regroup-on-promote failed"),
				);
				if (
					serverId &&
					!(await enrichmentStateRepository.isTerminal(promote.id))
				) {
					await enqueueBookEnrich(promote.id, promote.uuid).catch((err) =>
						log.error(
							{ err, bookId: promote.id },
							"Enrich enqueue failed for promoted book",
						),
					);
				}
			}
			if (existing) {
				// Clean up affected orphaned series and authors.
				if (relatedEntities) {
					await Promise.all([
						...relatedEntities.authorIds.map((id) =>
							bookMetadataRepository.deleteAuthorIfOrphaned(id),
						),
						...relatedEntities.seriesIds.map((id) =>
							bookMetadataRepository.deleteSeriesIfOrphaned(id),
						),
					]).catch((err) =>
						log.error({ err, bookId: existing.id }, "Entity cleanup failed"),
					);
				}
			}
		}

		return { path, action };
	} catch (err) {
		log.error({ err, jobId: job.id, path }, "Failed job");
		throw err;
	}
}

export const fileEventWorker = new Worker(
	"file-events",
	async (job) => {
		const result = await handleFileEvent(job);
		// taskId rides the return value so the progress listener can count this
		// completion without a Redis round-trip (survives removeOnComplete).
		return { taskId: job.data?.taskId, ...result };
	},
	{
		connection: redis,
		concurrency: CONCURRENCY,
	},
);

// Counting is handled by the task progress listener (QueueEvents); these
// handlers are log-only for ops visibility.
let processedCount = 0;
fileEventWorker.on("completed", () => {
	processedCount++;
	if (processedCount % 1000 === 0) {
		log.info({ processedCount }, "Completed jobs");
	}
});

fileEventWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed job");
	if (!job) return;
	// `failed` fires on every attempt; only the terminal one flips the row so
	// the next scan re-enqueues it. Delete jobs have no scanned_file row left.
	if (job.attemptsMade < (job.opts.attempts || 1)) return;
	const { action, path, libraryPathId } = job.data ?? {};
	const paths =
		action === "add"
			? [path]
			: action === "add-audiobook"
				? ((job.data as AudiobookJobData).audioFiles?.map((af) => af.path) ??
					[])
				: [];
	if (paths.length === 0 || !libraryPathId) return;
	scannedFileRepository
		.markFailed(paths, libraryPathId)
		.catch((markErr) =>
			log.error({ err: markErr, jobId: job.id }, "markFailed error"),
		);
});
