import { type Job, Worker } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { bookRepository } from "../../routers/books/book.repository";
import { bookMetadataService } from "../../routers/books/metadata/metadata.service";
import { redis } from "../queue/redis";
import { generateDeterministicUUID } from "../../utils/misc";
import os from "os";

// Prepared statement for updating file status to 'done' or 'deleted', efficient for repeated use
const updateStatusDone = db
	.update(scannedFile)
	.set({
		status: "done",
		updatedAt: new Date(),
	})
	.where(eq(scannedFile.path, sql.placeholder("path")))
	.prepare("update_status_done");

const numCPUs = os.cpus().length;
const CONCURRENCY =
	Number(process.env.WORKER_CONCURRENCY) || Math.max(2, numCPUs * 2);

const LIMITER_MAX = Math.min(CONCURRENCY * 2, 100);
const LIMITER_DURATION = 1000;

console.log(
	`[Worker] Starting with concurrency=${CONCURRENCY} (CPUs=${numCPUs})`
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
			libraryPathId
		} = job.data;

		try {
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

				if (bookInserted) {
					await bookMetadataService.enrichAndSaveMetadata({
						bookId: bookInserted.id,
						uuid: bookInserted.uuid,
					});
				}

				await updateStatusDone.execute({ path });
			}else if(action === "delete"){
				await bookRepository.removeBookByRelativePath(relativePath, libraryPathId);
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
		limiter: {
			max: LIMITER_MAX,
			duration: LIMITER_DURATION,
		},
	},
);

let processedCount = 0;
fileEventWorker.on("completed", (_job: Job) => {
	processedCount++;
	if (processedCount % 1000 === 0) {
		console.log(`[Worker] Completed ${processedCount} jobs`);
	}
});

fileEventWorker.on("failed", (job, err) => {
	console.error(`[Worker] Failed job ${job?.id}`, err);
});
