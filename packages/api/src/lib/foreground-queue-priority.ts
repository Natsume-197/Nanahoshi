import { logger } from "./logger";

type QueueCounts = {
	active?: number;
	waiting?: number;
	prioritized?: number;
};

type BackgroundWorker = {
	pause: (doNotWaitActive?: boolean) => Promise<void>;
	resume: () => void;
};

type PriorityControllerOptions = {
	backgroundWorker: BackgroundWorker;
	readForegroundCounts: () => Promise<QueueCounts>;
};

export type QueuePrioritySample =
	| "yielded"
	| "resumed"
	| "unchanged"
	| "load_error";

/**
 * Give a latency-sensitive queue exclusive access to worker CPU while it has
 * work. The pause is local to this worker process and never persists in Redis.
 */
export function createForegroundQueuePriorityController({
	backgroundWorker,
	readForegroundCounts,
}: PriorityControllerOptions): {
	sample: () => Promise<QueuePrioritySample>;
} {
	let yielded = false;

	return {
		sample: async () => {
			let counts: QueueCounts;
			try {
				counts = await readForegroundCounts();
			} catch {
				return "load_error";
			}

			const foregroundWork =
				(counts.active ?? 0) +
				(counts.waiting ?? 0) +
				(counts.prioritized ?? 0);
			if (foregroundWork > 0 && !yielded) {
				// Do not wait for already-active cover jobs; let them finish while no
				// new image work is leased from Redis.
				await backgroundWorker.pause(true);
				yielded = true;
				return "yielded";
			}
			if (foregroundWork === 0 && yielded) {
				backgroundWorker.resume();
				yielded = false;
				return "resumed";
			}
			return "unchanged";
		},
	};
}

/** Poll queue load closely enough that cover work yields during short scans. */
export function startForegroundQueuePriorityController(
	options: PriorityControllerOptions,
	intervalMs = 500,
): { close: () => Promise<void> } {
	const log = logger.child({ component: "foreground-queue-priority" });
	const controller = createForegroundQueuePriorityController(options);
	let closed = false;
	let sampleInFlight: Promise<void> | null = null;

	const trigger = () => {
		if (closed || sampleInFlight) return;
		sampleInFlight = controller
			.sample()
			.then((result) => {
				if (result === "yielded") {
					log.info("Cover processing yielded to file-event backlog");
				} else if (result === "resumed") {
					log.info("Cover processing resumed after file-event drain");
				} else if (result === "load_error") {
					log.warn(
						"Could not read file-event load; leaving cover worker unchanged",
					);
				}
			})
			.finally(() => {
				sampleInFlight = null;
			});
	};

	trigger();
	const timer = setInterval(trigger, intervalMs);
	timer.unref();

	return {
		close: async () => {
			closed = true;
			clearInterval(timer);
			await sampleInFlight;
		},
	};
}
