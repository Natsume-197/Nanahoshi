import { Queue } from "bullmq";
import { redis } from "../redis";

export const scheduledScanQueue = new Queue("scheduled-scan", {
	connection: redis,
});
