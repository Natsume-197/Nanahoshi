import { env } from "@nanahoshi-v2/env/server";
import type { JobsOptions } from "bullmq";
import { waitForQueueCapacity } from "../../infrastructure/queue/backpressure";
import { fileEventQueue } from "../../infrastructure/queue/queues/file-event.queue";
import { logger } from "../../lib/logger";
import { reserve, throwIfTaskCancelled } from "../taskManager";

const log = logger.child({ component: "scan-queue-producer" });

export type ScanQueueJob = {
	name: string;
	data: Record<string, unknown>;
	opts?: JobsOptions;
};

export async function enqueueScanJobs(
	jobs: ScanQueueJob[],
	taskId?: string,
): Promise<void> {
	const batchSize = env.SCAN_QUEUE_BATCH_SIZE ?? 250;
	for (let offset = 0; offset < jobs.length; offset += batchSize) {
		const batch = jobs.slice(offset, offset + batchSize);
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
		if (taskId) await reserve(taskId, batch.length);
		await fileEventQueue.addBulk(batch);
	}
}
