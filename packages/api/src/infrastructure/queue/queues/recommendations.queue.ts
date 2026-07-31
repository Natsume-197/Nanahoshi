import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const recommendationsQueue = new Queue("recommendations", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
