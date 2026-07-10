import { Queue } from "bullmq";
import { redis } from "../redis";

export const fileEventQueue = new Queue("file-events", {
	connection: redis,
	defaultJobOptions: {
		// Transient failures (I/O, DB) retry on their own; a terminal failure
		// marks the scanned_file row "failed" so the next scan re-enqueues it.
		attempts: 3,
		backoff: { type: "exponential", delay: 30_000 },
	},
});
