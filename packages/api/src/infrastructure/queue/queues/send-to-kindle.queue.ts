import { Queue } from "bullmq";
import { redis } from "../redis";

export const sendToKindleQueue = new Queue("send-to-kindle", {
	connection: redis,
});
