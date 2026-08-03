import { describe, expect, test } from "bun:test";
import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import {
	getLibraryTaskProgressState,
	SCAN_PROGRESS_STALE_MS,
	scanProgressStaleDelay,
} from "../library-task-progress-state";

const baseTask: Task = {
	id: "scan-1",
	type: "library-scan",
	serverId: "server-1",
	label: "Scanning",
	status: "running",
	totalJobs: 0,
	completedJobs: 0,
	failedJobs: 0,
	createdAt: 1,
	finishedAt: null,
	sealed: false,
	userId: "user-1",
	libraryId: 4,
};

const scanProgress = {
	phase: "discovery" as const,
	discovered: 20,
	statted: 18,
	hashed: 12,
	persisted: 10,
	errors: 0,
	statConcurrency: 32,
	hashConcurrency: 8,
	throughput: 3.5,
	lastProgressAt: 1_000,
};

describe("library task progress state", () => {
	test("keeps legacy scans in preparing until metrics arrive", () => {
		expect(getLibraryTaskProgressState(baseTask, 2_000)).toEqual({
			kind: "preparing",
		});
	});

	test("shows live and stale discovery from the injectable clock", () => {
		const task = { ...baseTask, scanProgress };
		expect(getLibraryTaskProgressState(task, 2_000)).toMatchObject({
			kind: "scan",
			persisted: 10,
			hashed: 12,
			stale: false,
		});
		expect(
			getLibraryTaskProgressState(
				task,
				scanProgress.lastProgressAt + SCAN_PROGRESS_STALE_MS + 1,
			),
		).toMatchObject({ kind: "scan", stale: true });
	});

	test("schedules a refresh exactly at the stale boundary", () => {
		expect(scanProgressStaleDelay(1_000, 2_000)).toBe(
			SCAN_PROGRESS_STALE_MS - 999,
		);
		expect(
			scanProgressStaleDelay(1_000, 1_000 + SCAN_PROGRESS_STALE_MS + 1),
		).toBe(0);
	});

	test("prefers a new discovery phase over job totals from an earlier path", () => {
		expect(
			getLibraryTaskProgressState({
				...baseTask,
				totalJobs: 40,
				completedJobs: 10,
				scanProgress,
			}),
		).toMatchObject({ kind: "scan", phase: "discovery" });
	});

	test("uses job progress once enqueue starts", () => {
		expect(
			getLibraryTaskProgressState({
				...baseTask,
				totalJobs: 40,
				completedJobs: 10,
				failedJobs: 2,
				scanProgress: { ...scanProgress, phase: "enqueue" },
			}),
		).toEqual({
			kind: "jobs",
			done: 12,
			total: 40,
			remaining: 28,
			percent: 30,
		});
	});

	test("uses the planned total while the queue producer is backpressured", () => {
		expect(
			getLibraryTaskProgressState({
				...baseTask,
				totalJobs: 4_562,
				plannedJobs: 80_681,
				completedJobs: 4_562,
				scanProgress: { ...scanProgress, phase: "enqueue" },
			}),
		).toEqual({
			kind: "jobs",
			done: 4_562,
			total: 80_681,
			remaining: 76_119,
			percent: 6,
		});
	});

	test("represents completed and failed tasks truthfully", () => {
		expect(
			getLibraryTaskProgressState({ ...baseTask, status: "completed" }),
		).toEqual({ kind: "completed" });
		expect(
			getLibraryTaskProgressState({
				...baseTask,
				status: "failed",
				reason: "Library path unavailable",
			}),
		).toEqual({ kind: "failed", reason: "Library path unavailable" });
	});
});
