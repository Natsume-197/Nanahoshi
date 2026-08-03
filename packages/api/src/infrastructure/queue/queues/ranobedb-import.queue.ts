import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const ranobedbImportQueue = new Queue("ranobedb-import", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
