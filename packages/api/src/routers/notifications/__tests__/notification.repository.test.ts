import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for NotificationRepository: insert-then-prune retention, keyset
 * pagination, and read-state updates scoped to the owning user.
 *
 * Run with:
 *   bun test packages/api/src/routers/notifications/__tests__/notification.repository.test.ts
 */

let insertedValues: Record<string, unknown> | null = null;
let insertReturnValue: Array<Record<string, unknown>> = [];
let deleteCalls = 0;
let selectResult: Array<Record<string, unknown>> = [];
let updateSetValues: Record<string, unknown> | null = null;
let updateCalls = 0;

function createInsertChain() {
	const chain = {} as {
		values: ReturnType<typeof mock>;
		returning: ReturnType<typeof mock>;
	};
	chain.values = mock((v: Record<string, unknown>) => {
		insertedValues = v;
		return chain;
	});
	chain.returning = mock(() => Promise.resolve(insertReturnValue));
	return chain;
}

function createSelectChain() {
	const chain = Promise.resolve().then(() => selectResult) as Promise<
		Array<Record<string, unknown>>
	> & {
		from: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
		orderBy: ReturnType<typeof mock>;
		limit: ReturnType<typeof mock>;
	};
	chain.from = mock(() => chain);
	chain.where = mock(() => chain);
	chain.orderBy = mock(() => chain);
	chain.limit = mock(() => chain);
	return chain;
}

function createDeleteChain() {
	deleteCalls++;
	const chain = {} as { where: ReturnType<typeof mock> };
	chain.where = mock(() => Promise.resolve({ rowCount: 1 }));
	return chain;
}

function createUpdateChain() {
	updateCalls++;
	const chain = {} as {
		set: ReturnType<typeof mock>;
		where: ReturnType<typeof mock>;
	};
	chain.set = mock((v: Record<string, unknown>) => {
		updateSetValues = v;
		return chain;
	});
	chain.where = mock(() => Promise.resolve({ rowCount: 1 }));
	return chain;
}

const dbLike = {
	insert: mock(() => createInsertChain()),
	select: mock(() => createSelectChain()),
	delete: mock(() => createDeleteChain()),
	update: mock(() => createUpdateChain()),
	transaction: mock(async (fn: (tx: unknown) => Promise<unknown>) =>
		fn(dbLike),
	),
};

mock.module("@nanahoshi-v2/db", () => ({ db: dbLike }));

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const { NotificationRepository } = await import("../notification.repository");

describe("NotificationRepository", () => {
	let repo: InstanceType<typeof NotificationRepository>;

	beforeEach(() => {
		repo = new NotificationRepository();
		insertedValues = null;
		insertReturnValue = [
			{
				id: 1,
				userId: "u1",
				type: "task_finished",
				payload: {},
				readAt: null,
			},
		];
		selectResult = [];
		updateSetValues = null;
		deleteCalls = 0;
		updateCalls = 0;
		dbLike.insert.mockClear();
		dbLike.select.mockClear();
		dbLike.delete.mockClear();
		dbLike.update.mockClear();
		dbLike.transaction.mockClear();
	});

	test("insertAndPrune inserts the payload and prunes in one transaction", async () => {
		const data = {
			type: "task_finished" as const,
			taskId: "task-1",
			taskType: "library-scan",
			label: "Novels",
			totalJobs: 1,
			completedJobs: 1,
			failedJobs: 0,
		};
		const row = await repo.insertAndPrune("u1", data);

		expect(dbLike.transaction).toHaveBeenCalledTimes(1);
		expect(insertedValues).toMatchObject({
			userId: "u1",
			type: "task_finished",
			payload: data,
		});
		// Retention: the prune delete runs on every insert (no cron).
		expect(deleteCalls).toBe(1);
		expect(row).toMatchObject({ id: 1, userId: "u1" });
	});

	test("insertAndPrune throws when the insert returns no row", async () => {
		insertReturnValue = [];
		await expect(
			repo.insertAndPrune("u1", {
				type: "task_finished",
				taskId: "task-1",
				taskType: "library-scan",
				label: "Novels",
				totalJobs: 1,
				completedJobs: 1,
				failedJobs: 0,
			}),
		).rejects.toThrow();
	});

	test("list returns rows and unreadCount reads the count row", async () => {
		selectResult = [{ id: 3 }, { id: 2 }];
		const rows = await repo.list("u1", 20, 4);
		expect(rows).toHaveLength(2);

		selectResult = [{ count: 5 }];
		expect(await repo.unreadCount("u1")).toBe(5);
	});

	test("markAllRead and markRead stamp read_at via update", async () => {
		await repo.markAllRead("u1");
		expect(updateCalls).toBe(1);
		expect(updateSetValues).toHaveProperty("readAt");

		await repo.markRead("u1", [1, 2]);
		expect(updateCalls).toBe(2);
	});
});
