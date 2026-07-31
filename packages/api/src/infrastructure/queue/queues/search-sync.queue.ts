import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const searchSyncQueue = new Queue("search-sync", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
