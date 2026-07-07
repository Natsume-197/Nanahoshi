import os from "node:os";
import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import {
	type AudiobookJobData,
	processAudiobook,
} from "../../modules/audiobookProcessor";
import {
	convertToEpub,
	getConvertedEpubPath,
	getMediaTypeForExtension,
	isConversionAvailable,
	needsConversion,
	removeConvertedFile,
} from "../../modules/conversion/converter";
import {
	enqueueBookEnrich,
	findMemberToPromote,
	regroupBookDuplicates,
} from "../../modules/duplicateGrouping";
import { scannedFileRepository } from "../../modules/scanning/scannedFile.repository";
import {
	getOrCreateScanEnrichTask,
	isTaskCancelled,
	reserve,
} from "../../modules/taskManager";
import { bookRepository } from "../../routers/books/book.repository";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { libraryRepository } from "../../routers/libraries/library.repository";
import { generateDeterministicUUID } from "../../utils/misc";
import { metadataEnrichQueue } from "../queue/queues/metadata-enrich.queue";
import { redis } from "../queue/redis";
import { fetchBookRelatedEntities } from "../search/search.document";
import {
	enqueueBulkEntitySync,
	enqueueSearchSync,
} from "../search/search-sync.service";

const log = logger.child({ component: "file-event-worker" });

const numCPUs = os.cpus().length;
// numCPUs, not 2×: each job hits Postgres inline, and a too-aggressive worker
// starves the enrich worker on the shared DB during big scans.
const CONCURRENCY =
	Number(process.env.WORKER_CONCURRENCY) || Math.max(2, numCPUs);

log.info({ concurrency: CONCURRENCY, cpus: numCPUs }, "Starting");

// A library's server (better-auth org) never changes, so cache the lookup to
// avoid a query per job.
const serverIdByLibrary = new Map<number, string | null>();
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
): Promise<void> {
	// No scan task or server means there's no enrich task to attribute this to.
	if (!scanTaskId || !serverId) return;
	const enrichTaskId = await getOrCreateScanEnrichTask(scanTaskId, serverId);
	// Null means the scan already finished (this job was in flight when it did);
	// enriching under a task nobody will seal would leave it running forever.
	if (!enrichTaskId) return;
	// Reserve before enqueuing so the enrich task's total can't transiently look
	// complete while the scan is still discovering books.
	await reserve(enrichTaskId, 1);
	await metadataEnrichQueue
		.add(
			name,
			{ bookId, uuid, taskId: enrichTaskId },
			{
				removeOnComplete: { age: 60 },
				removeOnFail: { count: 100 },
				priority: 10,
				attempts: 3,
				backoff: { type: "exponential", delay: 60_000 },
			},
		)
		.catch((err) =>
			log.error({ err, bookId }, "Metadata enrich enqueue failed"),
		);
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
			if (needsConversion(filename) && !isConversionAvailable()) {
				log.warn({ filename }, "Skipping: ebook-convert not available");
				await scannedFileRepository.markDone(path, libraryPathId);
				return { path, action, skipped: "converter_unavailable" };
			}

			// A book already at this path means the file was modified on disk:
			// update it in place instead of inserting a second book.
			const existingBook = await bookRepository.getByRelativePath(
				relativePath,
				libraryPathId,
			);
			if (existingBook) {
				if (existingBook.filehash === fileHash) {
					await scannedFileRepository.markDone(path, libraryPathId);
					return { path, action, skipped: "already_exists" };
				}

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

				if (needsConversion(filename)) {
					await convertToEpub(path, existingBook.uuid);
				}
				await bookMetadataService.enrichAndSaveMetadata({
					bookId: existingBook.id,
					uuid: existingBook.uuid,
					filePath: needsConversion(filename)
						? getConvertedEpubPath(existingBook.uuid)
						: path,
				});
				await regroupBookDuplicates(existingBook.id).catch((err) =>
					log.error({ err, bookId: existingBook.id }, "Regroup failed"),
				);
				await enqueueSearchSync(existingBook.id, "update").catch((err) =>
					log.error(
						{ err, bookId: existingBook.id },
						"Search sync enqueue failed",
					),
				);
				await scannedFileRepository.markDone(path, libraryPathId);
				return { path, action, updated: true };
			}

			const uuid = generateDeterministicUUID(filename, fileHash);
			const mediaType = getMediaTypeForExtension(filename);

			const bookInserted = await bookRepository.create({
				uuid,
				filename: filename,
				filehash: fileHash,
				libraryId: libraryId,
				libraryPathId: libraryPathId,
				relativePath: relativePath,
				filesizeKb: Math.round(size / 1024),
				lastModified: lastModified,
				mediaType,
			});

			// Book already exists (ON CONFLICT DO NOTHING returned undefined) — skip all heavy work
			if (!bookInserted) {
				await scannedFileRepository.markDone(path, libraryPathId);
				return { path, action, skipped: "already_exists" };
			}

			// Convert non-EPUB formats to EPUB before metadata extraction
			if (needsConversion(filename)) {
				await convertToEpub(path, uuid);
			}

			// Verify book still exists (may have been deleted by a concurrent worker)
			const stillExists = await bookRepository.getById(bookInserted.id);
			if (!stillExists) {
				if (needsConversion(filename)) {
					await removeConvertedFile(uuid).catch(() => {});
				}
				await scannedFileRepository.markDone(path, libraryPathId);
				return { path, action, skipped: "deleted_during_processing" };
			}

			await bookMetadataService.enrichAndSaveMetadata({
				bookId: bookInserted.id,
				uuid: bookInserted.uuid,
				filePath: needsConversion(filename) ? getConvertedEpubPath(uuid) : path,
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
			);

			// Enqueue search index sync (no-op for PGroonga, async for ES)
			await enqueueSearchSync(bookInserted.id, "create").catch((err) =>
				log.error(
					{ err, bookId: bookInserted.id },
					"Search sync enqueue failed",
				),
			);

			await scannedFileRepository.markDone(path, libraryPathId);
		} else if (action === "add-audiobook") {
			const audioData = job.data as AudiobookJobData;

			const markAudioFilesDone = async () => {
				for (const af of audioData.audioFiles) {
					await scannedFileRepository.markDone(af.path, libraryPathId);
				}
			};

			// Same as ebooks: a modified audiobook updates the existing book
			// instead of inserting a duplicate.
			const existingBook = await bookRepository.getByRelativePath(
				relativePath,
				libraryPathId,
			);
			if (existingBook) {
				if (existingBook.filehash === fileHash) {
					await markAudioFilesDone();
					return { path: relativePath, action, skipped: "already_exists" };
				}

				const updated = await bookRepository.updateFileInfo(existingBook.id, {
					filehash: fileHash,
					filesizeKb: Math.round(size / 1024),
					lastModified,
				});
				if (updated) {
					await processAudiobook(existingBook.id, existingBook.uuid, audioData);
					await enqueueSearchSync(existingBook.id, "update").catch((err) =>
						log.error(
							{ err, bookId: existingBook.id },
							"Search sync enqueue failed for audiobook",
						),
					);
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
			);

			await enqueueSearchSync(bookInserted.id, "create").catch((err) =>
				log.error(
					{ err, bookId: bookInserted.id },
					"Search sync enqueue failed for audiobook",
				),
			);

			await markAudioFilesDone();
		} else if (action === "delete") {
			// Get the book before deleting so we can remove it from search
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
					!(await bookMetadataRepository.isAmazonEnriched(promote.id))
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
				await removeConvertedFile(existing.uuid).catch((err) =>
					log.error(
						{ err, bookId: existing.id },
						"Failed to remove converted file",
					),
				);
				await enqueueSearchSync(existing.id, "delete").catch((err) =>
					log.error({ err, bookId: existing.id }, "Search sync enqueue failed"),
				);
				// Sync affected series/authors and clean up orphans
				if (relatedEntities) {
					await Promise.all([
						enqueueBulkEntitySync(relatedEntities),
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
});
