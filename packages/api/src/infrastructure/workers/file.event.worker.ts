import os from "node:os";
import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { type Job, Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import {
	incrementCompleted,
	incrementFailed,
	isTaskCancelled,
} from "../../modules/taskManager";
import { bookRepository } from "../../routers/books/book.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { generateDeterministicUUID } from "../../utils/misc";
import { redis } from "../queue/redis";
import { enqueueSearchSync } from "../search/search-sync.service";

// Prepared statement for updating file status to 'done', scoped by path and libraryPathId
const updateStatusDone = db
	.update(scannedFile)
	.set({
		status: "done",
		updatedAt: new Date(),
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
				const bookInserted = await bookRepository.create({
					uuid: generateDeterministicUUID(filename, fileHash),
					filename: filename,
					filehash: fileHash,
					libraryId: libraryId,
					libraryPathId: libraryPathId,
					relativePath: relativePath,
					filesizeKb: Math.round(size / 1024),
					lastModified: lastModified,
				});

				// Book already exists (ON CONFLICT DO NOTHING returned undefined) — skip all heavy work
				if (!bookInserted) {
					await updateStatusDone.execute({ path, libraryPathId });
					return { path, action, skipped: "already_exists" };
				}

				await bookMetadataService.enrichAndSaveMetadata({
					bookId: bookInserted.id,
					uuid: bookInserted.uuid,
				});

				// Enqueue search index sync (no-op for PGroonga, async for ES)
				await enqueueSearchSync(bookInserted.id, "create").catch((err) =>
					console.error(
						`[Worker] Search sync enqueue failed for book ${bookInserted.id}:`,
						err,
					),
				);

				await updateStatusDone.execute({ path, libraryPathId });
			} else if (action === "delete") {
				// Get the book before deleting so we can remove it from search
				const existing = await bookRepository.getByRelativePath(
					relativePath,
					libraryPathId,
				);
				await bookRepository.removeBookByRelativePath(
					relativePath,
					libraryPathId,
				);
				if (existing) {
					await enqueueSearchSync(existing.id, "delete").catch((err) =>
						console.error(
							`[Worker] Search sync enqueue failed for book ${existing.id}:`,
							err,
						),
					);
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
