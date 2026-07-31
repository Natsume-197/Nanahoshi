import os from "node:os";
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
export function imageThreadsFor(role: "api" | "worker"): number {
	const cores = Math.max(1, os.cpus().length);
	// The worker is already nice(10) and cpu_shares-limited, so it may lean on
	// the box. The API shares its cores with the event loop serving every other
	// request, and only encodes narrow renditions inline.
	return role === "worker"
		? Math.max(2, Math.floor(cores / 2))
		: Math.max(1, Math.floor(cores / 4));
}

/** Jobs the cover-ingest worker runs at once. Pairs with `imageThreadsFor`. */
export function coverJobConcurrency(): number {
	return Math.max(2, Math.floor(Math.max(1, os.cpus().length) / 2));
}

export function configureImageConcurrency(role: "api" | "worker"): number {
	const threads = imageThreadsFor(role);
	sharp.concurrency(threads);
	return threads;
}
