import { Queue } from "bullmq";
import { redis } from "../redis";

export const bookIndexQueue = new Queue("book-index", {
	connection: redis,
});
