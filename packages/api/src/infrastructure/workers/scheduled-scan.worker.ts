import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import type { ScheduledScanJobData } from "../../modules/scanning/scheduled-scan.scheduler";
import * as libraryService from "../../routers/libraries/library.service";
import { redis } from "../queue/redis";

const log = logger.child({ component: "scheduled-scan-worker" });

export const scheduledScanWorker = new Worker(
	"scheduled-scan",
	async (job: Job<ScheduledScanJobData>) => {
		const { libraryId, serverId } = job.data;
		log.info({ libraryId }, "Running scheduled scan");
		return await libraryService.scanLibraryById(libraryId, serverId);
	},
	{
		connection: redis,
		// Scans are serialized inside scanLibrary; one at a time is plenty.
		concurrency: 1,
	},
);

scheduledScanWorker.on("failed", (job, err) => {
	log.error(
		{ err, libraryId: job?.data?.libraryId },
		"Scheduled scan job failed",
	);
});
