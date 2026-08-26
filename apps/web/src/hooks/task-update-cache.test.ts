import { describe, expect, test } from "bun:test";
import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import {
	createTaskUpdateBatcher,
	MAX_VISIBLE_ACTIVE_TASKS,
	mergeActiveTaskUpdates,
	selectVisibleActiveTasks,
} from "./task-update-cache";

function task(id: number, percent = 0): Task {
	return {
		id: String(id),
		type: "read-listen-generation",
		serverId: "server-1",
		label: `Honomiya ${id}`,
		status: "running",
		totalJobs: 1,
		plannedJobs: 1,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: id,
		finishedAt: null,
		sealed: true,
		userId: "user-1",
		libraryId: null,
		operationProgress: {
			phase: "transcribing",
			percent,
			updatedAt: percent,
		},
	};
}

describe("task update cache", () => {
	test("merges a burst in one pass and keeps only the latest update per task", () => {
		const old = Array.from({ length: 1_000 }, (_, index) => task(index));
		const completed = { ...task(10, 100), status: "completed" as const };

		const next = mergeActiveTaskUpdates(old, [
			task(500, 20),
			task(500, 40),
			completed,
			task(1_001, 5),
		]);

		expect(next).toHaveLength(1_000);
		expect(next[0]?.id).toBe("1001");
		expect(
			next.find((item) => item.id === "500")?.operationProgress?.percent,
		).toBe(40);
		expect(next.some((item) => item.id === "10")).toBe(false);
	});

	test("caps the notification rail work for 1,000 active Honomiya tasks", () => {
		const tasks = Array.from({ length: 1_000 }, (_, index) => task(index));
		const firstPage = selectVisibleActiveTasks(tasks);
		const lastPage = selectVisibleActiveTasks(tasks, 49);

		expect(firstPage.visible).toHaveLength(MAX_VISIBLE_ACTIVE_TASKS);
		expect(firstPage).toMatchObject({ from: 1, to: 20, total: 1_000 });
		expect(lastPage.visible).toHaveLength(MAX_VISIBLE_ACTIVE_TASKS);
		expect(lastPage).toMatchObject({ from: 981, to: 1_000, total: 1_000 });
	});

	test("coalesces a gateway burst into one cache update", () => {
		const flushes: Task[][] = [];
		const batcher = createTaskUpdateBatcher(
			(tasks) => flushes.push(tasks),
			60_000,
		);

		for (let index = 0; index < 1_000; index++) {
			batcher.push(task(index, 10));
			batcher.push(task(index, 20));
		}
		batcher.flushNow();

		expect(flushes).toHaveLength(1);
		expect(flushes[0]).toHaveLength(1_000);
		expect(flushes[0]?.[500]?.operationProgress?.percent).toBe(20);
	});
});
