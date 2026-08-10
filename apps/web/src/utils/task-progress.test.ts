import { describe, expect, test } from "bun:test";
import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import { getTaskJobProgress } from "./task-progress";

const task: Task = {
	id: "task-1",
	type: "read-listen-generation",
	serverId: "server-1",
	label: "Generating alignment",
	status: "running",
	totalJobs: 1,
	plannedJobs: 1,
	completedJobs: 0,
	failedJobs: 0,
	createdAt: 1,
	finishedAt: null,
	sealed: true,
	userId: "user-1",
	libraryId: null,
};

describe("task progress", () => {
	test("uses fine-grained operation progress while a job is running", () => {
		expect(
			getTaskJobProgress({
				...task,
				operationProgress: {
					phase: "transcribing",
					percent: 47,
					completed: 5,
					total: 12,
					updatedAt: 2,
				},
			}).percent,
		).toBe(47);
	});

	test("shows terminal job completion instead of stale operation progress", () => {
		expect(
			getTaskJobProgress({
				...task,
				status: "completed",
				completedJobs: 1,
				operationProgress: {
					phase: "importing",
					percent: 99,
					updatedAt: 2,
				},
			}).percent,
		).toBe(100);
	});
});
