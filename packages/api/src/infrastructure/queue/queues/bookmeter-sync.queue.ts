import { Queue } from "bullmq";
import { redis } from "../redis";

export const bookmeterSyncQueue = new Queue("bookmeter-sync", {
	connection: redis,
});
