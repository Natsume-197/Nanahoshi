import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const scheduledScanQueue = new Queue("scheduled-scan", {
	connection: redis,
	defaultJobOptions: {
		attempts: 3,
		backoff: { type: "exponential", delay: 30_000 },
		...JOB_RETENTION,
	},
});
