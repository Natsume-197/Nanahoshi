import { bookmeterSyncQueue } from "../../infrastructure/queue/queues/bookmeter-sync.queue";
import { logger } from "../../lib/logger";
import { createTask } from "../taskManager";

const log = logger.child({ component: "bookmeter-scheduler" });

export type BookmeterSyncUserJobData = { userId: string; taskId?: string };

// removeOnComplete keeps the coalescing jobIds reusable; keep some failures
// visible in Bull Board.
export const BOOKMETER_JOB_OPTS = {
	removeOnComplete: true,
	removeOnFail: { count: 50 },
} as const;

/**
 * Task-tracked syncs get a unique jobId (a coalesced duplicate would leave the
 * second task running forever); untracked ones coalesce per user.
 */
export async function enqueueBookmeterUserSync(
	userId: string,
	taskId?: string,
): Promise<void> {
	await bookmeterSyncQueue
		.add("sync-user", { userId, taskId } satisfies BookmeterSyncUserJobData, {
			...BOOKMETER_JOB_OPTS,
			jobId: taskId
				? `bookmeter-user-${userId}-${taskId}`
				: `bookmeter-user-${userId}`,
		})
		.catch((err) =>
			log.error({ err, userId }, "Failed to enqueue bookmeter sync"),
		);
}

/**
 * User-initiated sync (link / "sync now"): one task-tracked job so the sync
 * shows up in the activity rail and notifies on finish. Returns the task id.
 */
export async function startTrackedUserSync(
	userId: string,
	serverId: string | null,
): Promise<string> {
	const task = await createTask({
		type: "bookmeter-sync",
		serverId,
		userId,
		totalJobs: 1,
		sealed: true,
		payload: { userId },
	});
	await enqueueBookmeterUserSync(userId, task.id);
	return task.id;
}

/** Nightly sweep over every linked user; registered from the worker process. */
export async function registerBookmeterSchedule(): Promise<void> {
	await bookmeterSyncQueue.upsertJobScheduler(
		"bookmeter-sync-all",
		{ pattern: "45 4 * * *" },
		{ name: "sync-all", opts: BOOKMETER_JOB_OPTS },
	);
}
