import { env } from "@nanahoshi-v2/env/server";
import type { Queue } from "bullmq";

const PENDING_JOB_TYPES = [
	"wait",
	"prioritized",
	"delayed",
	"paused",
	"waiting-children",
] as const;

export type QueueBackpressureConfig = {
	highWatermark: number;
	lowWatermark: number;
	pollMs: number;
};

const defaultConfig: QueueBackpressureConfig = {
	highWatermark: env.SCAN_QUEUE_HIGH_WATERMARK ?? 2000,
	lowWatermark: env.SCAN_QUEUE_LOW_WATERMARK ?? 1000,
	pollMs: env.SCAN_QUEUE_POLL_MS ?? 250,
};

type QueueDepthProbe = Pick<Queue, "getJobCountByTypes">;

async function pendingJobCount(queue: QueueDepthProbe): Promise<number> {
	return await queue.getJobCountByTypes(...PENDING_JOB_TYPES);
}

export async function waitForQueueCapacity(
	queue: QueueDepthProbe,
	incomingJobs: number,
	config: QueueBackpressureConfig = defaultConfig,
	hooks: {
		checkCancelled?: () => Promise<void>;
		sleep?: (milliseconds: number) => Promise<void>;
	} = {},
): Promise<{ pending: number; throttled: boolean }> {
	if (!Number.isInteger(incomingJobs) || incomingJobs < 1) {
		throw new Error("incomingJobs must be a positive integer");
	}
	const sleep = hooks.sleep ?? Bun.sleep;
	await hooks.checkCancelled?.();
	let pending = await pendingJobCount(queue);
	if (pending + incomingJobs <= config.highWatermark) {
		return { pending, throttled: false };
	}

	do {
		await hooks.checkCancelled?.();
		await sleep(config.pollMs);
		pending = await pendingJobCount(queue);
	} while (pending > config.lowWatermark);

	return { pending, throttled: true };
}
