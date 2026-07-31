import { Queue } from "bullmq";
import { redis } from "../redis";
import { JOB_RETENTION } from "./job-retention";

export const sendToKindleQueue = new Queue("send-to-kindle", {
	connection: redis,
	defaultJobOptions: { ...JOB_RETENTION },
});
