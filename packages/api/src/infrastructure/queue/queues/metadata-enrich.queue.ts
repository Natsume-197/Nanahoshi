import { Queue } from "bullmq";
import { redis } from "../redis";

export const metadataEnrichQueue = new Queue("metadata-enrich", {
	connection: redis,
});
