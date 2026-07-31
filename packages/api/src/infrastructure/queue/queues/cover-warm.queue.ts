import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const coverWarmQueue = new Queue("cover-warm", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
