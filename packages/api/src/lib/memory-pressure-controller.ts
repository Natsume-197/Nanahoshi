import {
	runtimeMemoryCapacity,
	runtimeMemoryUsage,
} from "@nanahoshi-v2/env/resources";
import { logger } from "./logger";
import { nextConcurrencyForMemoryPressure } from "./worker-budget";

type AdjustableWorker = {
	concurrency: number;
};

type Target = {
	name: string;
	worker: AdjustableWorker & {
		on: (
			event: "active" | "completed" | "failed",
			listener: () => void,
		) => unknown;
		off: (
			event: "active" | "completed" | "failed",
			listener: () => void,
		) => unknown;
	};
	maximumConcurrency?: number;
};

export type MemoryPressureTargetState = {
	name: string;
	worker: AdjustableWorker;
	maximumConcurrency: number;
	activeJobs: number;
};

type Adjustment = {
	name: string;
	previous: number;
	concurrency: number;
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
		const next = nextConcurrencyForMemoryPressure(
			previous,
			target.maximumConcurrency,
			pressure,
			target.activeJobs >= previous,
		);
		if (next === previous) continue;
		target.worker.concurrency = next;
		adjustments.push({ name: target.name, previous, concurrency: next });
	}

	return adjustments;
}

/** Dynamically tunes memory-heavy BullMQ workers against shared cgroup usage. */
export function startMemoryPressureController(
	targets: Target[],
	intervalMs = 5_000,
): { close: () => Promise<void> } {
	const states: MemoryPressureTargetState[] = targets.map(
		({ name, worker, maximumConcurrency }) => ({
			name,
			worker,
			maximumConcurrency: Math.max(
				worker.concurrency,
				Math.floor(maximumConcurrency ?? worker.concurrency),
			),
			activeJobs: 0,
		}),
	);
	const listeners = targets.map(({ worker }, index) => {
		const state = states[index];
		const onActive = () => {
			if (state) state.activeJobs += 1;
		};
		const onSettled = () => {
			if (state) state.activeJobs = Math.max(0, state.activeJobs - 1);
		};
		worker.on("active", onActive);
		worker.on("completed", onSettled);
		worker.on("failed", onSettled);
		return { worker, onActive, onSettled };
	});
	log.info(
		{
			capacity: runtimeMemoryCapacity(),
			used: runtimeMemoryUsage(),
			workers: states.map(({ name, worker, maximumConcurrency }) => ({
				name,
				initial: worker.concurrency,
				maximum: maximumConcurrency,
			})),
		},
		"Started dynamic worker memory controller",
	);

	const adjust = () => {
		const capacity = runtimeMemoryCapacity();
		const used = runtimeMemoryUsage();
		const pressure = used / capacity;

		for (const adjustment of adjustMemoryPressureTargets(
			states,
			capacity,
			used,
		)) {
			log.info(
				{ ...adjustment, pressure, used, capacity },
				"Adjusted worker concurrency for memory pressure",
			);
		}
	};

	adjust();
	const timer = setInterval(adjust, intervalMs);
	timer.unref();

	return {
		close: async () => {
			clearInterval(timer);
			for (const { worker, onActive, onSettled } of listeners) {
				worker.off("active", onActive);
				worker.off("completed", onSettled);
				worker.off("failed", onSettled);
			}
		},
	};
}
