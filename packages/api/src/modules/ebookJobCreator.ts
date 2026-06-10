import path from "node:path";
import { db } from "@nanahoshi-v2/db";
import { scannedFile } from "@nanahoshi-v2/db/schema/general";
import { and, eq, gt } from "drizzle-orm";
import { fileEventQueue } from "../infrastructure/queue/queues/file-event.queue";
import { needsConversion } from "./conversion/converter";
import { incrementTotalJobs } from "./taskManager";

const JOB_BATCH_SIZE = 10000;

export async function createEbookJobs(opts: {
	rootDir: string;
	libraryId: number;
	libraryPathId: number;
	taskId?: string;
}): Promise<number> {
	const { rootDir, libraryId, libraryPathId, taskId } = opts;
	let jobsCreated = 0;
	let lastId = 0;

	while (true) {
		const files = await db
			.select()
			.from(scannedFile)
			.where(
				and(
					eq(scannedFile.status, "verified"),
					eq(scannedFile.libraryPathId, libraryPathId),
					gt(scannedFile.id, lastId),
				),
			)
			.orderBy(scannedFile.id)
			.limit(JOB_BATCH_SIZE);

		const lastFile = files.at(-1);
		if (!lastFile) break;
		lastId = lastFile.id;

		const jobBatch = files.map((file) => {
			const normalizedFilePath = path.normalize(file.path);
			const relPath = path
				.relative(rootDir, normalizedFilePath)
				.replace(/\\/g, "/");
			const filename = path.basename(file.path);

			return {
				name: "file-event",
				data: {
					action: "add",
					mediaType: "ebook" as const,
					path: file.path,
					mtime: file.mtime.getTime(),
					size: file.size,
					filename,
					relativePath: relPath,
					lastModified: file.mtime.toISOString(),
					fileHash: file.hash,
					libraryId,
					libraryPathId,
					taskId,
				},
				opts: {
					// Files needing conversion (AZW3) get lower priority so EPUBs process first
					priority: needsConversion(filename) ? 10 : 1,
				},
			};
		});

		await fileEventQueue.addBulk(jobBatch);
		if (taskId) {
			await incrementTotalJobs(taskId, jobBatch.length);
		}
		jobsCreated += jobBatch.length;

		const rate = jobsCreated > 0 ? jobsCreated.toLocaleString() : "0";
		console.log(`≫ Jobs queued: ${rate}`);
	}

	return jobsCreated;
}
