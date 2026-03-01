import { Queue } from "bullmq";
import { redis } from "../redis";

export const coverColorQueue = new Queue("cover-color", {
	connection: redis,
});
