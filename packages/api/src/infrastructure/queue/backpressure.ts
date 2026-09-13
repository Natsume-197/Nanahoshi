import type { Queue } from "bullmq";
import { scanQueueBudget } from "../../lib/worker-budget";

const PENDING_JOB_TYPES = [
	"wait",
	"prioritized",
	"delayed",
	"waiting-children",
] as const;

export type QueueBackpressureConfig = {
	highWatermark: number;
	lowWatermark: number;
	pollMs: number;
};

const defaultConfig: QueueBackpressureConfig = {
	...scanQueueBudget(),
	pollMs: 250,
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
	if (incomingJobs > config.highWatermark) {
		throw new Error("incomingJobs must fit within the queue high watermark");
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
	} while (
		pending > config.lowWatermark ||
		pending + incomingJobs > config.highWatermark
	);

	return { pending, throttled: true };
}
