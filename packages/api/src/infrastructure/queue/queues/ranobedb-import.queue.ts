import { Queue } from "bullmq";
import { redis } from "../redis";

export const ranobedbImportQueue = new Queue("ranobedb-import", {
	connection: redis,
});
