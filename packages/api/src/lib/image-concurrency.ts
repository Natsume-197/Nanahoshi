import {
	runtimeCpuCapacity,
	runtimeMemoryCapacity,
	runtimeWorkerCpuBudget,
} from "@nanahoshi-v2/env/resources";
import sharp from "sharp";

/**
 * How many threads libvips may use per image operation.
 *
 * sharp arrives here configured for a single thread, which silently caps every
 * resize and encode in the app at one core. Measured on 8 cores over real
 * covers, raising it is the largest single lever in the whole cover pipeline:
 *
 *   avif q90 effort4 @2000   17434 ms -> 4332 ms
 *   serve 1200w avif q95      1218 ms ->  386 ms
 *   warm 4 rungs               840 ms ->  366 ms
 *
 * Threads and job concurrency multiply, so neither should take the whole box.
 * The measured throughput sweet spot for warming is threads ≈ jobs ≈ cores/2
 * (203 ms/cover, against 840 ms at one thread and one job).
 */
export function imageThreadsFor(
	role: "api" | "worker",
	cpuCount = runtimeCpuCapacity(),
	workerBudget = runtimeWorkerCpuBudget(),
): number {
	const cores = Math.max(1, Math.floor(cpuCount));
	if (role === "api") return Math.max(1, Math.min(2, Math.floor(cores / 4)));
	return Math.max(1, Math.min(cores, Math.floor(Math.sqrt(workerBudget))));
}

/** Jobs the cover-ingest worker runs at once. Pairs with `imageThreadsFor`. */
export function coverJobConcurrency(
	cpuCount = runtimeCpuCapacity(),
	workerBudget = runtimeWorkerCpuBudget(),
	memoryCapacity = runtimeMemoryCapacity(),
): number {
	const threads = imageThreadsFor("worker", cpuCount, workerBudget);
	const cpuSlots = Math.max(1, Math.floor(workerBudget / threads));
	// Covers receive one fifth of the shared cgroup budget at startup. Runtime
	// pressure monitoring can then reduce or restore this ceiling live.
	const memorySlots = Math.max(
		1,
		Math.floor((memoryCapacity * 0.2) / (256 * 1024 ** 2)),
	);
	return Math.min(cpuSlots, memorySlots);
}

export function configureImageConcurrency(role: "api" | "worker"): number {
	const threads = imageThreadsFor(role);
	sharp.concurrency(threads);
	return threads;
}
