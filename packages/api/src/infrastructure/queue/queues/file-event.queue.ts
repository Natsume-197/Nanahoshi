import { Queue } from "bullmq";
import { redis } from "../redis";

export const fileEventQueue = new Queue("file-events", {
	connection: redis,
});
