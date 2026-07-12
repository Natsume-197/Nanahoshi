import { Queue } from "bullmq";
import { redis } from "../redis";

export const recommendationsQueue = new Queue("recommendations", {
	connection: redis,
});
