import path from "node:path";
import { env } from "@nanahoshi-v2/env/server";
import { logger } from "../../lib/logger";
import { needsConversion } from "../conversion/converter";
import { throwIfTaskCancelled } from "../taskManager";
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
	let jobsCreated = 0;
	let lastId = 0;

	while (true) {
		await throwIfTaskCancelled(taskId);
		const files = await scannedFileRepository.listVerifiedAfter(
			libraryPathId,
			lastId,
			env.SCAN_QUEUE_BATCH_SIZE ?? 250,
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
				// Files needing conversion (AZW3) are deprioritized so EPUBs process
				// first; unprioritized jobs use the cheaper FIFO list and always run
				// before prioritized ones.
				opts: needsConversion(filename) ? { priority: 10 } : {},
			};
		});

		await enqueueScanJobs(jobBatch, taskId);
		jobsCreated += jobBatch.length;

		log.info({ jobsCreated }, "Jobs queued");
	}

	return jobsCreated;
}
