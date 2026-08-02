import {
	runtimeMemoryCapacity,
	runtimeMemoryUsage,
} from "@nanahoshi-v2/env/resources";
import { logger } from "./logger";
import { nextConcurrencyForMemoryPressure } from "./worker-budget";

type AdjustableWorker = {
	concurrency: number;
};

type JobCounts = {
	active?: number;
	waiting?: number;
	prioritized?: number;
};

export type MemoryPressureTarget = {
	name: string;
	worker: AdjustableWorker;
	maximumConcurrency?: number;
	readJobCounts: () => Promise<JobCounts>;
};

export type MemoryPressureTargetState = {
	name: string;
	worker: AdjustableWorker;
	maximumConcurrency: number;
	activeJobs: number;
	queuedJobs: number;
};

type Adjustment = {
	name: string;
	previous: number;
	concurrency: number;
};

type LoadError = {
	name: string;
	err: unknown;
};

const log = logger.child({ component: "memory-pressure-controller" });

/** Apply one deterministic controller sample. Exported as the regression seam. */
export function adjustMemoryPressureTargets(
	targets: MemoryPressureTargetState[],
	capacity: number,
	used: number,
): Adjustment[] {
	const pressure = used / capacity;
	const adjustments: Adjustment[] = [];

	for (const target of targets) {
		const previous = target.worker.concurrency;
		const isSaturated = target.activeJobs >= previous && target.queuedJobs > 0;
		const next = nextConcurrencyForMemoryPressure(
			previous,
			target.maximumConcurrency,
			pressure,
			isSaturated,
		);
		if (next !== previous) {
			target.worker.concurrency = next;
			adjustments.push({ name: target.name, previous, concurrency: next });
		}
	}

	return adjustments;
}

/** Read BullMQ's authoritative Redis counts, then apply one controller sample. */
export async function sampleMemoryPressureTargets(
	targets: MemoryPressureTarget[],
	capacity: number,
	used: number,
): Promise<{ adjustments: Adjustment[]; loadErrors: LoadError[] }> {
	const loadErrors: LoadError[] = [];
	const states = await Promise.all(
		targets.map(async (target): Promise<MemoryPressureTargetState> => {
			let counts: JobCounts = {};
			try {
				counts = await target.readJobCounts();
			} catch (err) {
				loadErrors.push({ name: target.name, err });
			}
			return {
				name: target.name,
				worker: target.worker,
				maximumConcurrency: Math.max(
					target.worker.concurrency,
					Math.floor(target.maximumConcurrency ?? target.worker.concurrency),
				),
				activeJobs: counts.active ?? 0,
				queuedJobs: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
			};
		}),
	);

	return {
		adjustments: adjustMemoryPressureTargets(states, capacity, used),
		loadErrors,
	};
}

/** Dynamically tunes memory-heavy BullMQ workers against shared cgroup usage. */
export function startMemoryPressureController(
	targets: MemoryPressureTarget[],
	intervalMs = 5_000,
): { close: () => Promise<void> } {
	log.info(
		{
			capacity: runtimeMemoryCapacity(),
			used: runtimeMemoryUsage(),
			workers: targets.map(({ name, worker, maximumConcurrency }) => ({
				name,
				initial: worker.concurrency,
				maximum: maximumConcurrency ?? worker.concurrency,
			})),
		},
		"Started dynamic worker memory controller",
	);

	let closed = false;
	let sampleInFlight: Promise<void> | null = null;
	const adjust = async () => {
		const capacity = runtimeMemoryCapacity();
		const used = runtimeMemoryUsage();
		const pressure = used / capacity;
		const { adjustments, loadErrors } = await sampleMemoryPressureTargets(
			targets,
			capacity,
			used,
		);
		for (const { name, err } of loadErrors) {
			log.warn({ name, err }, "Failed to read worker queue load");
		}
		for (const adjustment of adjustments) {
			log.info(
				{ ...adjustment, pressure, used, capacity },
				"Adjusted worker concurrency for memory pressure",
			);
		}
	};
	const trigger = () => {
		if (closed || sampleInFlight) return;
		sampleInFlight = adjust()
			.catch((err) => log.warn({ err }, "Memory controller sample failed"))
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
