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
	worker: AdjustableWorker;
};

const log = logger.child({ component: "memory-pressure-controller" });

/** Dynamically tunes memory-heavy BullMQ workers against shared cgroup usage. */
export function startMemoryPressureController(
	targets: Target[],
	intervalMs = 5_000,
): { close: () => Promise<void> } {
	const maximums = new Map(
		targets.map(({ name, worker }) => [name, worker.concurrency]),
	);
	log.info(
		{
			capacity: runtimeMemoryCapacity(),
			used: runtimeMemoryUsage(),
			workers: targets.map(({ name, worker }) => ({
				name,
				maximum: worker.concurrency,
			})),
		},
		"Started dynamic worker memory controller",
	);

	const adjust = () => {
		const capacity = runtimeMemoryCapacity();
		const used = runtimeMemoryUsage();
		const pressure = used / capacity;

		for (const { name, worker } of targets) {
			const maximum = maximums.get(name) ?? 1;
			const previous = worker.concurrency;
			const next = nextConcurrencyForMemoryPressure(
				previous,
				maximum,
				pressure,
			);
			if (next === previous) continue;
			worker.concurrency = next;
			log.info(
				{ name, previous, concurrency: next, pressure, used, capacity },
				"Adjusted worker concurrency for memory pressure",
			);
		}
	};

	adjust();
	const timer = setInterval(adjust, intervalMs);
	timer.unref();

	return {
		close: async () => clearInterval(timer),
	};
}
