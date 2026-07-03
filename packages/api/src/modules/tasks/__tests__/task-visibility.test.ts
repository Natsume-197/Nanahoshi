import { describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for taskVisibleTo: server admins see every server task, regular
 * members only what they initiated, app owners also the global ones.
 *
 * Run with:
 *   bun test packages/api/src/modules/tasks/__tests__/task-visibility.test.ts
 */

// Benign mocks so importing taskManager doesn't open Redis/queue connections.
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));
mock.module("ioredis", () => ({
	Redis: class {
		options = {};
		on() {}
		subscribe() {
			return Promise.resolve();
		}
		publish() {
			return Promise.resolve(0);
		}
	},
}));
mock.module("bullmq", () => ({
	Queue: class {
		on() {}
	},
	QueueEvents: class {
		on() {}
	},
	Worker: class {
		on() {}
	},
}));

const { taskVisibleTo } = await import("../../taskManager");
type Task = import("../../taskManager").Task;
type TaskScope = import("../../taskManager").TaskScope;

function task(overrides: Partial<Task>): Task {
	return {
		id: "t1",
		type: "library-scan",
		serverId: "server-A",
		label: "",
		status: "running",
		totalJobs: 1,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: 1,
		sealed: false,
		userId: null,
		libraryId: null,
		...overrides,
	};
}

function scope(overrides: Partial<TaskScope>): TaskScope {
	return {
		serverId: "server-A",
		isAppOwner: false,
		isServerAdmin: false,
		userId: "member-1",
		...overrides,
	};
}

describe("taskVisibleTo", () => {
	test("server admin sees every task of their server", () => {
		expect(
			taskVisibleTo(
				task({ userId: "someone-else" }),
				scope({ isServerAdmin: true }),
			),
		).toBe(true);
		expect(
			taskVisibleTo(task({ userId: null }), scope({ isServerAdmin: true })),
		).toBe(true);
	});

	test("regular member only sees tasks they initiated", () => {
		expect(taskVisibleTo(task({ userId: "member-1" }), scope({}))).toBe(true);
		expect(taskVisibleTo(task({ userId: "someone-else" }), scope({}))).toBe(
			false,
		);
		// Scheduled/system tasks (no initiator) are admin-only.
		expect(taskVisibleTo(task({ userId: null }), scope({}))).toBe(false);
	});

	test("tasks never leak across servers", () => {
		expect(
			taskVisibleTo(
				task({ serverId: "server-B", userId: "member-1" }),
				scope({ isServerAdmin: true }),
			),
		).toBe(false);
	});

	test("global tasks are app-owner only", () => {
		const globalTask = task({ serverId: null, userId: "member-1" });
		expect(taskVisibleTo(globalTask, scope({ isServerAdmin: true }))).toBe(
			false,
		);
		expect(taskVisibleTo(globalTask, scope({ isAppOwner: true }))).toBe(true);
	});

	test("app owner also sees the active server's tasks", () => {
		expect(
			taskVisibleTo(
				task({ userId: "someone-else" }),
				scope({ isAppOwner: true }),
			),
		).toBe(true);
	});
});
