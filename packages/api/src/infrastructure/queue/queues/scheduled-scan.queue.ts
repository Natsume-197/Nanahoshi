import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const scheduledScanQueue = new Queue("scheduled-scan", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
