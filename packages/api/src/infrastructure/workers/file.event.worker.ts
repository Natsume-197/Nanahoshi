import os from "node:os";
import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { type Job, Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import {
	type AudiobookJobData,
	processAudiobook,
} from "../../modules/audiobookProcessor";
import {
	convertToEpub,
	getMediaTypeForExtension,
	isConversionAvailable,
	needsConversion,
	removeConvertedFile,
} from "../../modules/conversion/converter";
import {
	getOrCreateAutoEnrichTask,
	incrementCompleted,
	incrementFailed,
	incrementTotalJobs,
	isTaskCancelled,
} from "../../modules/taskManager";
import { bookRepository } from "../../routers/books/book.repository";
import { bookMetadataRepository } from "../../routers/books/metadata/metadata.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { generateDeterministicUUID } from "../../utils/misc";
import { metadataEnrichQueue } from "../queue/queues/metadata-enrich.queue";
import { redis } from "../queue/redis";
import { fetchBookRelatedEntities } from "../search/search.document";
import {
	enqueueBulkEntitySync,
	enqueueSearchSync,
} from "../search/search-sync.service";

// Prepared statement for updating file status to 'done', scoped by path and libraryPathId
const updateStatusDone = db
	.update(scannedFile)
	.set({
		status: "done",
		updatedAt: sql`now()`,
	})
	.where(
		and(
			eq(scannedFile.path, sql.placeholder("path")),
			eq(scannedFile.libraryPathId, sql.placeholder("libraryPathId")),
		),
	)
	.prepare("update_status_done");

const numCPUs = os.cpus().length;
const CONCURRENCY =
	Number(process.env.WORKER_CONCURRENCY) || Math.max(2, numCPUs * 2);

console.log(
	`[Worker] Starting with concurrency=${CONCURRENCY} (CPUs=${numCPUs})`,
);

export const fileEventWorker = new Worker(
	"file-events",
	async (job) => {
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
			if (action === "add") {
				// Skip files that need conversion when ebook-convert is not installed
				if (needsConversion(filename) && !isConversionAvailable()) {
					console.warn(
						`[Worker] Skipping ${filename}: ebook-convert not available`,
					);
					await updateStatusDone.execute({ path, libraryPathId });
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
						await updateStatusDone.execute({ path, libraryPathId });
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
						await updateStatusDone.execute({ path, libraryPathId });
						return { path, action, skipped: "duplicate_content" };
					}

					if (needsConversion(filename)) {
						await convertToEpub(path, existingBook.uuid);
					}
					await bookMetadataService.enrichAndSaveMetadata({
						bookId: existingBook.id,
						uuid: existingBook.uuid,
					});
					await enqueueSearchSync(existingBook.id, "update").catch((err) =>
						console.error(
							`[Worker] Search sync enqueue failed for book ${existingBook.id}:`,
							err,
						),
					);
					await updateStatusDone.execute({ path, libraryPathId });
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
					await updateStatusDone.execute({ path, libraryPathId });
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
					await updateStatusDone.execute({ path, libraryPathId });
					return { path, action, skipped: "deleted_during_processing" };
				}

				await bookMetadataService.enrichAndSaveMetadata({
					bookId: bookInserted.id,
					uuid: bookInserted.uuid,
				});

				// Enqueue Amazon metadata enrichment in background (non-blocking)
				const enrichTaskId = await getOrCreateAutoEnrichTask();
				await incrementTotalJobs(enrichTaskId, 1);
				await metadataEnrichQueue
					.add(
						"enrich-book",
						{
							bookId: bookInserted.id,
							uuid: bookInserted.uuid,
							taskId: enrichTaskId,
						},
						{
							removeOnComplete: { age: 60 },
							removeOnFail: { count: 100 },
							priority: 10,
							attempts: 3,
							backoff: {
								type: "exponential",
								delay: 60_000,
							},
						},
					)
					.catch((err) =>
						console.error(
							`[Worker] Metadata enrich enqueue failed for book ${bookInserted.id}:`,
							err,
						),
					);

				// Enqueue search index sync (no-op for PGroonga, async for ES)
				await enqueueSearchSync(bookInserted.id, "create").catch((err) =>
					console.error(
						`[Worker] Search sync enqueue failed for book ${bookInserted.id}:`,
						err,
					),
				);

				await updateStatusDone.execute({ path, libraryPathId });
			} else if (action === "add-audiobook") {
				const audioData = job.data as AudiobookJobData;

				const markAudioFilesDone = async () => {
					for (const af of audioData.audioFiles) {
						await updateStatusDone.execute({ path: af.path, libraryPathId });
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
						await processAudiobook(
							existingBook.id,
							existingBook.uuid,
							audioData,
						);
						await enqueueSearchSync(existingBook.id, "update").catch((err) =>
							console.error(
								`[Worker] Search sync enqueue failed for audiobook ${existingBook.id}:`,
								err,
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
				const enrichTaskId = await getOrCreateAutoEnrichTask();
				await incrementTotalJobs(enrichTaskId, 1);
				await metadataEnrichQueue
					.add(
						"enrich-audiobook",
						{
							bookId: bookInserted.id,
							uuid: bookInserted.uuid,
							taskId: enrichTaskId,
						},
						{
							removeOnComplete: { age: 60 },
							removeOnFail: { count: 100 },
							priority: 10,
							attempts: 3,
							backoff: {
								type: "exponential",
								delay: 60_000,
							},
						},
					)
					.catch((err) =>
						console.error(
							`[Worker] Metadata enrich enqueue failed for audiobook ${bookInserted.id}:`,
							err,
						),
					);

				// Enqueue search index sync
				await enqueueSearchSync(bookInserted.id, "create").catch((err) =>
					console.error(
						`[Worker] Search sync enqueue failed for audiobook ${bookInserted.id}:`,
						err,
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

				await bookRepository.removeBookByRelativePath(
					relativePath,
					libraryPathId,
				);
				if (existing) {
					// Clean up converted file if it exists
					await removeConvertedFile(existing.uuid).catch((err) =>
						console.error(
							`[Worker] Failed to remove converted file for book ${existing.id}:`,
							err,
						),
					);
					await enqueueSearchSync(existing.id, "delete").catch((err) =>
						console.error(
							`[Worker] Search sync enqueue failed for book ${existing.id}:`,
							err,
						),
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
							console.error(
								`[Worker] Entity cleanup failed for book ${existing.id}:`,
								err,
							),
						);
					}
				}
			}

			return { path, action };
		} catch (err) {
			console.error(`[Worker] Failed job ${job.id} path=${path}`, err);
			throw err;
		}
	},
	{
		connection: redis,
		concurrency: CONCURRENCY,
	},
);

let processedCount = 0;
fileEventWorker.on("completed", (job: Job) => {
	processedCount++;
	if (processedCount % 1000 === 0) {
		console.log(`[Worker] Completed ${processedCount} jobs`);
	}
	if (job.data?.taskId) {
		incrementCompleted(job.data.taskId).catch(() => {});
	}
});

fileEventWorker.on("failed", (job, err) => {
	console.error(`[Worker] Failed job ${job?.id}`, err);
	if (job?.data?.taskId) {
		incrementFailed(job.data.taskId).catch(() => {});
	}
});
