import type { Task } from "@nanahoshi-v2/api/modules/taskManager";

export type TaskJobProgress = {
	done: number;
	total: number;
	remaining: number;
	percent: number;
};

/** Uses the producer's known final total while the queue is still being fed. */
export function getTaskJobProgress(task: Task): TaskJobProgress {
	const done = task.completedJobs + task.failedJobs;
	const total = Math.max(task.totalJobs, task.plannedJobs ?? 0);
	const operationPercent =
		task.status === "running" && task.operationProgress
			? Math.max(0, Math.min(99, Math.round(task.operationProgress.percent)))
			: undefined;
	return {
		done,
		total,
		remaining: Math.max(0, total - done),
		percent:
			operationPercent ??
			(total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100))),
	};
}
