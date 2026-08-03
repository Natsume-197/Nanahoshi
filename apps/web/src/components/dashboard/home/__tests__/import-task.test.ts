import { describe, expect, it } from "bun:test";
import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import { IMPORT_TASK_TYPES, pickActiveImport } from "../import-task";

function task(overrides: Partial<Task> & { type: string }): Task {
	return {
		id: overrides.id ?? `t-${overrides.type}`,
		serverId: "srv",
		label: overrides.type,
		status: "running",
		totalJobs: 0,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: 0,
		sealed: false,
		userId: null,
		libraryId: 1,
		...overrides,
	};
}

describe("pickActiveImport", () => {
	it("returns null for undefined or empty task lists", () => {
		expect(pickActiveImport(undefined)).toBeNull();
		expect(pickActiveImport([])).toBeNull();
	});

	it("returns a running import task", () => {
		const scan = task({ type: "library-scan" });
		expect(pickActiveImport([scan])).toBe(scan);
	});

	it("covers every declared import type", () => {
		for (const type of IMPORT_TASK_TYPES) {
			const t = task({ type });
			expect(pickActiveImport([t])).toBe(t);
		}
	});

	it("ignores non-import task types (e.g. a recommendations rebuild)", () => {
		expect(
			pickActiveImport([task({ type: "recommendations-rebuild" })]),
		).toBeNull();
	});

	it("ignores import tasks that are no longer running", () => {
		expect(
			pickActiveImport([task({ type: "library-scan", status: "completed" })]),
		).toBeNull();
	});

	it("skips finished/unrelated tasks and returns the first running import", () => {
		const done = task({ type: "library-scan", status: "completed", id: "a" });
		const other = task({ type: "recommendations-rebuild", id: "b" });
		const running = task({ type: "library-upload", id: "c" });
		expect(pickActiveImport([done, other, running])).toBe(running);
	});
});
