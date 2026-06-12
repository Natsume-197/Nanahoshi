import { type Job, Worker } from "bullmq";
import { runRanobedbImport } from "../../modules/ranobedb/ranobedb.import";
import { redis } from "../queue/redis";

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
	console.log(`[Worker] Completed RanobeDB import job ${job?.id}`);
});

ranobedbImportWorker.on("failed", (job, err) => {
	console.error(`[Worker] Failed RanobeDB import job ${job?.id}`, err);
});
