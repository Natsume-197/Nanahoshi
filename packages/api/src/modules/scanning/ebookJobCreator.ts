import path from "node:path";
import { logger } from "../../lib/logger";
import { scanQueueBudget } from "../../lib/worker-budget";
import { planJobs, throwIfTaskCancelled } from "../taskManager";
import { enqueueScanJobs } from "./scan-queue-producer";
import { scannedFileRepository } from "./scannedFile.repository";

const log = logger.child({ component: "ebook-job-creator" });

export async function createEbookJobs(opts: {
	rootDir: string;
	libraryId: number;
	libraryPathId: number;
	taskId?: string;
}): Promise<number> {
	const { rootDir, libraryId, libraryPathId, taskId } = opts;
	const { batchSize } = scanQueueBudget();
	let jobsCreated = 0;
	let lastId = 0;

	if (taskId) {
		const planned = await scannedFileRepository.countVerified(libraryPathId);
		await planJobs(taskId, `ebook:${libraryPathId}`, planned);
	}

	while (true) {
		await throwIfTaskCancelled(taskId);
		const files = await scannedFileRepository.listVerifiedAfter(
			libraryPathId,
			lastId,
			batchSize,
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
				opts: {},
			};
		});

		await enqueueScanJobs(jobBatch, taskId);
		jobsCreated += jobBatch.length;

		log.info({ jobsCreated }, "Jobs queued");
	}

	return jobsCreated;
}
