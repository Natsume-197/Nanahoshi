import { describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

const { ScanRunRepository, sanitizeScanFailure } = await import(
	"../scanRun.repository"
);
type RepositoryDatabase = ConstructorParameters<typeof ScanRunRepository>[0];

const terminalRun = {
	id: "00000000-0000-4000-8000-000000000001",
	taskId: "task-1",
	libraryPathId: 7,
	mode: "full" as const,
	phase: "enqueue" as const,
	status: "completed" as const,
	discoveredCount: 10,
	stattedCount: 10,
	hashedCount: 10,
	persistedCount: 10,
	errorCount: 0,
	failure: null,
	startedAt: new Date(),
	heartbeatAt: new Date(),
	completedAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
};

describe("ScanRunRepository", () => {
	test("startOrResume uses one task/path identity and preserves terminal rows", async () => {
		let conflict: Record<string, unknown> | undefined;
		const chain = {
			values: mock(() => chain),
			onConflictDoUpdate: mock((config: Record<string, unknown>) => {
				conflict = config;
				return chain;
			}),
			returning: mock(() => Promise.resolve([terminalRun])),
		};
		const database = {
			insert: mock(() => chain),
			update: mock(() => {
				throw new Error("not used");
			}),
		} as unknown as RepositoryDatabase;
		const repository = new ScanRunRepository(database);

		const resumed = await repository.startOrResume("task-1", 7, "full");

		expect(resumed.status).toBe("completed");
		expect(conflict).toBeDefined();
		if (!conflict) throw new Error("conflict configuration was not captured");
		expect((conflict.target as unknown[]).length).toBe(2);
		const statusSql = new PgDialect().sqlToQuery(
			(conflict.set as { status: Parameters<PgDialect["sqlToQuery"]>[0] })
				.status,
		).sql;
		expect(statusSql).toContain("completed");
		expect(statusSql).toContain("cancelled");
	});

	test("terminal transitions only update an active run", async () => {
		let where: Parameters<PgDialect["sqlToQuery"]>[0] | undefined;
		const updateChain = {
			set: mock(() => updateChain),
			where: mock((condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
				where = condition;
				return Promise.resolve();
			}),
		};
		const database = {
			insert: mock(() => {
				throw new Error("not used");
			}),
			update: mock(() => updateChain),
		} as unknown as RepositoryDatabase;
		const repository = new ScanRunRepository(database);

		await repository.fail(terminalRun.id, new Error("first failure"));

		expect(where).toBeDefined();
		if (!where) throw new Error("terminal condition was not captured");
		const query = new PgDialect().sqlToQuery(where);
		expect(query.params).toContain("active");
		expect(query.params).not.toContain("failed");
	});

	test("failure text is bounded and strips control characters", () => {
		const sanitized = sanitizeScanFailure(
			new Error(`secret\npath\u0000${"x".repeat(600)}`),
		);
		expect(sanitized).not.toContain("\n");
		expect(sanitized).not.toContain("\u0000");
		expect(sanitized.length).toBe(500);
	});

	test("terminal producer failure closes every active path run for its task", async () => {
		let values: Record<string, unknown> | undefined;
		let where: Parameters<PgDialect["sqlToQuery"]>[0] | undefined;
		const updateChain = {
			set: mock((next: Record<string, unknown>) => {
				values = next;
				return updateChain;
			}),
			where: mock((condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
				where = condition;
				return Promise.resolve();
			}),
		};
		const database = {
			insert: mock(() => {
				throw new Error("not used");
			}),
			update: mock(() => updateChain),
		} as unknown as RepositoryDatabase;
		const repository = new ScanRunRepository(database);

		await repository.failActiveForTask("task-1", "worker\nrestarted");

		expect(values?.status).toBe("failed");
		expect(values?.failure).toBe("worker restarted");
		expect(where).toBeDefined();
		if (!where) throw new Error("terminal condition was not captured");
		const query = new PgDialect().sqlToQuery(where);
		expect(query.params).toContain("task-1");
		expect(query.params).toContain("active");
	});
});
