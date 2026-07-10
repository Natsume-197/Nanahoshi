import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import type { ScheduledScanJobData } from "../../modules/scanning/scheduled-scan.scheduler";
import { finalizeTask } from "../../modules/taskManager";
import * as libraryService from "../../routers/libraries/library.service";
import { redis } from "../queue/redis";

const log = logger.child({ component: "scheduled-scan-worker" });

// Scheduled (repeatable) jobs carry no taskId/op; manual scans and reprocesses
// enqueued by the API carry both, so the heavy producer work runs here in the
// worker process and survives restarts via BullMQ's stalled-job retry.
type LibraryOpsJobData = ScheduledScanJobData & {
	taskId?: string;
	op?: "scan" | "reprocess";
};

export const scheduledScanWorker = new Worker(
	"scheduled-scan",
	async (job: Job<LibraryOpsJobData>) => {
		const { libraryId, serverId, taskId, op } = job.data;
		if (op === "reprocess" && taskId) {
			log.info({ libraryId, taskId }, "Running library reprocess");
			return await libraryService.runLibraryReprocess({ libraryId, taskId });
		}
		log.info({ libraryId, taskId }, "Running library scan");
		return await libraryService.runLibraryScan({ libraryId, serverId, taskId });
	},
	{
		connection: redis,
		// One at a time on purpose: dedupe is library-wide, so two scans of one
		// library must never overlap; serializing everything also keeps a single
		// heavy producer on the machine.
		concurrency: 1,
	},
);

scheduledScanWorker.on("failed", (job, err) => {
	log.error(
		{ err, libraryId: job?.data?.libraryId },
		"Library scan/reprocess job failed",
	);
	// Terminal failure (including stalled-beyond-retry after a crash): seal the
	// task so already-enqueued jobs can drain it instead of leaving it running.
	const taskId = job?.data?.taskId;
	if (taskId) {
		finalizeTask(taskId).catch((finalizeErr) =>
			log.error({ err: finalizeErr, taskId }, "Failed to finalize task"),
		);
	}
});
