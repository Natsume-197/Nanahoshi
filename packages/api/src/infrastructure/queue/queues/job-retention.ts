import type { JobsOptions } from "bullmq";

/**
 * BullMQ retains completed/failed jobs forever by default. `file-events` runs
 * one job per scanned file, so a large library left 581k completed + 35k failed
 * records (~1GB of Redis) with nothing reading them.
 *
 * Completed records are safe to drop: task progress is counted off the durable
 * QueueEvents stream, and the taskId rides the job's return value. Failures
 * must stay count-based (never `true`) — task-progress.listener resolves them
 * with `Job.fromId` to tell a terminal failure from a retry.
 */
export const JOB_RETENTION = {
	removeOnComplete: { count: 500 },
	removeOnFail: { count: 1000 },
} satisfies Pick<JobsOptions, "removeOnComplete" | "removeOnFail">;
