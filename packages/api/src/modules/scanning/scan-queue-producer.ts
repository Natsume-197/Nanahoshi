import { createHash } from "node:crypto";
import { env } from "@nanahoshi-v2/env/server";
import type { JobsOptions } from "bullmq";
import { waitForQueueCapacity } from "../../infrastructure/queue/backpressure";
import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { logger } from "../../lib/logger";
import { reserveJobs, throwIfTaskCancelled } from "../taskManager";

const log = logger.child({ component: "scan-queue-producer" });

export type ScanQueueJob = {
	name: string;
	data: Record<string, unknown>;
	opts?: JobsOptions;
};

function stableScanJobId(job: ScanQueueJob, taskId: string): string {
	const logicalPath =
		job.data.path ?? job.data.dirPath ?? job.data.relativePath ?? "";
	const identity = JSON.stringify([
		taskId,
		job.name,
		job.data.action ?? "",
		job.data.libraryPathId ?? "",
		logicalPath,
		job.data.fileHash ?? "",
	]);
	return `scan-${createHash("sha256").update(identity).digest("hex")}`;
}

export async function enqueueScanJobs(
	jobs: ScanQueueJob[],
	taskId?: string,
): Promise<void> {
	const batchSize = env.SCAN_QUEUE_BATCH_SIZE ?? 250;
	for (let offset = 0; offset < jobs.length; offset += batchSize) {
		const batch = jobs.slice(offset, offset + batchSize).map((job) => {
			if (!taskId) return job;
			return {
				...job,
				opts: {
					...job.opts,
					jobId: job.opts?.jobId ?? stableScanJobId(job, taskId),
				},
			};
		});
		await throwIfTaskCancelled(taskId);
		const capacity = await waitForQueueCapacity(
			fileEventQueue,
			batch.length,
			undefined,
			{
				checkCancelled: () => throwIfTaskCancelled(taskId),
			},
		);
		if (capacity.throttled) {
			log.info(
				{ pending: capacity.pending, batch: batch.length },
				"Scan producer resumed after queue backlog drained",
			);
		}
		if (taskId) {
			await reserveJobs(
				taskId,
				batch.map((job) => job.opts?.jobId as string),
			);
		}
		await fileEventQueue.addBulk(batch);
	}
}
