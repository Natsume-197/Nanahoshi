import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const bookIndexQueue = new Queue("book-index", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
