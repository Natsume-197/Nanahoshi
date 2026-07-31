import path from "node:path";
import { type Job, Worker } from "bullmq";
import { warmCoverVariants } from "../../lib/cover-cache";
import { logger } from "../../lib/logger";
import { redis } from "../queue/redis";

const log = logger.child({ component: "cover-warm-worker" });

export type CoverWarmJobData = {
	coverPath: string;
};

export const coverWarmWorker = new Worker(
	"cover-warm",
	async (job: Job<CoverWarmJobData>) => {
		const imagePath = path.resolve(process.cwd(), job.data.coverPath);
		const { warmed, failed } = await warmCoverVariants(imagePath);
		if (failed > 0) {
			log.warn(
				{ imagePath, failed },
				"Some cover variants could not be rendered",
			);
		}
		return { warmed, failed };
	},
	{
		connection: redis,
		concurrency: 2,
	},
);

coverWarmWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed job");
});
