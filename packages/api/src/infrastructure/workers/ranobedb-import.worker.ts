import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import { runRanobedbImport } from "../../modules/ranobedb/ranobedb.import";
import { redis } from "../queue/redis";

const log = logger.child({ component: "ranobedb-import-worker" });

export const ranobedbImportWorker = new Worker(
	"ranobedb-import",
	async (job: Job<{ taskId?: string }>) => {
		return runRanobedbImport(job.data.taskId);
	},
	{
		connection: redis,
		concurrency: 1,
	},
);

ranobedbImportWorker.on("completed", (job) => {
	log.info({ jobId: job?.id }, "Completed RanobeDB import job");
});

ranobedbImportWorker.on("failed", (job, err) => {
	log.error({ err, jobId: job?.id }, "Failed RanobeDB import job");
});
