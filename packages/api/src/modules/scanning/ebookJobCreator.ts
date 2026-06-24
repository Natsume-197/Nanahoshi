import path from "node:path";
import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { logger } from "../../lib/logger";
import { needsConversion } from "../conversion/converter";
import { incrementTotalJobs } from "../taskManager";
import { scannedFileRepository } from "./scannedFile.repository";

const log = logger.child({ component: "ebook-job-creator" });

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
		const files = await scannedFileRepository.listVerifiedAfter(
			libraryPathId,
			lastId,
			JOB_BATCH_SIZE,
		);

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

		log.info({ jobsCreated }, "Jobs queued");
	}

	return jobsCreated;
}
