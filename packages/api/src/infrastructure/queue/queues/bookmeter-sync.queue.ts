import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const bookmeterSyncQueue = new Queue("bookmeter-sync", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
