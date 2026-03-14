import { Queue } from "bullmq";
import { redis } from "../redis";

export const searchSyncQueue = new Queue("search-sync", {
	connection: redis,
});
