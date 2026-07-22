import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import type { BookmeterSyncUserJobData } from "../../modules/bookmeter/bookmeter.scheduler";
import {
	syncAllLinkedUsers,
	syncUser,
} from "../../modules/bookmeter/bookmeter.service";
import { redis } from "../queue/redis";

const log = logger.child({ component: "bookmeter-sync-worker" });

async function processBookmeterSync(job: Job) {
	if (job.name === "sync-all") {
		await syncAllLinkedUsers();
		return;
	}
	const { userId, taskId } = job.data as BookmeterSyncUserJobData;
	const result = await syncUser(userId);
	// taskId rides the return value so the progress listener counts this sync
	// and the task finish emits the user's notification.
	return { ...result, taskId };
}

// Concurrency 1: every job talks to bookmeter.com — never hit it in parallel.
export const bookmeterSyncWorker = new Worker(
	"bookmeter-sync",
	processBookmeterSync,
	{
		connection: redis,
		concurrency: 1,
	},
);

bookmeterSyncWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id, jobName: job?.name }, "Failed job");
});
