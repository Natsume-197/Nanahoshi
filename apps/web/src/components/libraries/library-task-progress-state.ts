import type { Task } from "@nanahoshi-v2/api/modules/taskManager";

export const SCAN_PROGRESS_STALE_MS = 90_000;

export function scanProgressStaleDelay(
	lastProgressAt: number,
	now = Date.now(),
): number {
	return Math.max(0, lastProgressAt + SCAN_PROGRESS_STALE_MS + 1 - now);
}

export type LibraryTaskProgressState =
	| { kind: "failed"; reason?: string }
	| { kind: "completed" }
	| { kind: "preparing" }
	| {
			kind: "scan";
			phase: NonNullable<Task["scanProgress"]>["phase"];
			persisted: number;
			hashed: number;
			throughput: number;
			stale: boolean;
	  }
	| { kind: "jobs"; done: number; total: number; percent: number };

export function getLibraryTaskProgressState(
	task: Task,
	now = Date.now(),
): LibraryTaskProgressState {
	if (task.status === "failed") return { kind: "failed", reason: task.reason };
	if (task.status === "completed") return { kind: "completed" };
	if (
		task.scanProgress &&
		(task.totalJobs === 0 || task.scanProgress.phase !== "enqueue")
	) {
		return {
			kind: "scan",
			phase: task.scanProgress.phase,
			persisted: task.scanProgress.persisted,
			hashed: task.scanProgress.hashed,
			throughput: task.scanProgress.throughput,
			stale: now - task.scanProgress.lastProgressAt > SCAN_PROGRESS_STALE_MS,
		};
	}
	if (task.totalJobs === 0) return { kind: "preparing" };
	const done = task.completedJobs + task.failedJobs;
	return {
		kind: "jobs",
		done,
		total: task.totalJobs,
		percent: Math.min(100, Math.round((done / task.totalJobs) * 100)),
	};
}
