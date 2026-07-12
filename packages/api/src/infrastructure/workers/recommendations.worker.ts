import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { rebuildServer } from "../../modules/recommendations/rebuild.service";
import type {
	RebuildServerJobData,
	RefreshUserJobData,
} from "../../modules/recommendations/recommendation.scheduler";
import { redis } from "../queue/redis";

const log = logger.child({ component: "recommendations-worker" });

type JobData = RebuildServerJobData & Partial<RefreshUserJobData>;

export const recommendationsWorker = new Worker(
	"recommendations",
	async (job: Job<JobData>) => {
		if (job.name === "refresh-user" && job.data.userId) {
			const { refreshUser } = await import(
				"../../modules/recommendations/user-feed.service"
			);
			return await refreshUser(job.data.serverId, job.data.userId);
		}
		const result = await rebuildServer(job.data.serverId, {
			full: job.data.full,
			job,
		});
		return job.data.taskId ? { ...result, taskId: job.data.taskId } : result;
	},
	{
		connection: redis,
		// CPU-bound single nightly producer — never parallelize rebuilds
		concurrency: 1,
	},
);

recommendationsWorker.on("failed", (job, err) => {
	log.error(
		{ err, serverId: job?.data?.serverId, name: job?.name },
		"Recommendations job failed",
	);
});
