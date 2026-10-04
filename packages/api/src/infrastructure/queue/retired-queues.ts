import { Queue } from "bullmq";
import { redis } from "./redis";

// Queues of removed features: their schedulers would keep adding jobs no
// worker consumes.
const RETIRED_QUEUES = ["bookmeter-sync"];

export async function removeRetiredQueues(): Promise<void> {
	for (const name of RETIRED_QUEUES) {
		const queue = new Queue(name, { connection: redis });
		try {
			await queue.obliterate({ force: true });
		} finally {
			await queue.close();
		}
	}
}
