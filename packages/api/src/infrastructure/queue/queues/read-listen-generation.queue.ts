import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const readListenGenerationQueue = new Queue("read-listen-generation", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
