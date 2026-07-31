import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const metadataEnrichQueue = new Queue("metadata-enrich", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
