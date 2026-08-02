import { type Job, Worker } from "bullmq";
import { logger } from "../../lib/logger";
import type { LibraryScanMode } from "../../modules/scanning/libraryScanner";
import { scanRunRepository } from "../../modules/scanning/scanRun.repository";
import type { ScheduledScanJobData } from "../../modules/scanning/scheduled-scan.scheduler";
import { failTask } from "../../modules/taskManager";
import * as libraryService from "../../routers/libraries/library.service";
import { redis } from "../queue/redis";

const log = logger.child({ component: "scheduled-scan-worker" });

// Scheduled (repeatable) jobs carry no taskId/op; manual scans and reprocesses
// enqueued by the API carry both, so the heavy producer work runs here in the
// worker process and survives restarts via BullMQ's stalled-job retry.
type LibraryOpsJobData = ScheduledScanJobData & {
	taskId?: string;
	op?: "scan" | "reprocess" | "regroup" | "enrich";
	mode?: LibraryScanMode;
};

export const scheduledScanWorker = new Worker(
	"scheduled-scan",
	async (job: Job<LibraryOpsJobData>) => {
		const { libraryId, serverId, taskId, op, mode } = job.data;
		if (op === "reprocess" && taskId) {
			log.info({ libraryId, taskId }, "Running library reprocess");
			return await libraryService.runLibraryReprocess({ libraryId, taskId });
		}
		if (op === "regroup" && taskId) {
			log.info({ libraryId, taskId }, "Running library edition regroup");
			return await libraryService.runLibraryRegroup({ libraryId, taskId });
		}
		if (op === "enrich" && taskId) {
			log.info({ libraryId, taskId }, "Running library metadata refresh");
			return await libraryService.runLibraryEnrich({ libraryId, taskId });
		}
		log.info({ libraryId, taskId }, "Running library scan");
		return await libraryService.runLibraryScan({
			libraryId,
			serverId,
			taskId,
			mode,
			persistTaskId: taskId
				? undefined
				: async (createdTaskId) => {
						await job.updateData({
							...job.data,
							op: "scan",
							taskId: createdTaskId,
						});
					},
		});
	},
	{
		connection: redis,
		// One at a time on purpose: dedupe is library-wide, so two scans of one
		// library must never overlap; serializing everything also keeps a single
		// heavy producer on the machine.
		concurrency: 1,
		// A scan producer is durably checkpointed and safe to resume. Keep it alive
		// across deploys and bounded OOM restart loops instead of abandoning tens of
		// thousands of verified files after BullMQ's default single stall.
		maxStalledCount: 10,
	},
);

scheduledScanWorker.on("failed", (job, err) => {
	log.error(
		{ err, libraryId: job?.data?.libraryId },
		"Library scan/reprocess job failed",
	);
	if (!job) return;
	const isUnrecoverable = err.name === "UnrecoverableError";
	if (!isUnrecoverable && job.attemptsMade < (job.opts.attempts || 1)) return;
	// Terminal failure (including stalled-beyond-retry after a crash): retain a
	// truthful task state instead of making an unsuccessful producer look done.
	const taskId = job.data?.taskId;
	if (taskId) {
		const reason =
			err.message.replace(/\s+/g, " ").trim().slice(0, 500) ||
			"Background job failed";
		Promise.all([
			failTask(taskId, reason),
			scanRunRepository.failActiveForTask(taskId, reason),
		]).catch((failErr) =>
			log.error(
				{ err: failErr, taskId },
				"Failed to persist terminal scan failure",
			),
		);
	}
});
