import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const coverColorQueue = new Queue("cover-color", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
