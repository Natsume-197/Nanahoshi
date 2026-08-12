import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// The real queue module opens an ioredis connection at import time; stub the
// infrastructure before importing anything that pulls it in.
mock.module("../../../infrastructure/queue/redis", () => ({ redis: {} }));
mock.module("bullmq", () => ({
	Queue: class {
		upsertJobScheduler = async () => ({});
		removeJobScheduler = async () => true;
		getJobSchedulers = async () => [];
		add = async () => ({});
		addBulk = async () => [];
	},
	Worker: class {
		on() {}
		close = async () => {};
	},
}));

// taskManager talks to the DB; replace it with controllable fakes (same
// convention as library.service.test).
type FakeTask = { status: string; type: string; serverId?: string | null };
let activeTasks: FakeTask[] = [];
let createdTasks: { type: string; serverId?: string }[] = [];
let deletedTaskIds: string[] = [];
const mockCreateTask = mock(
	async (opts: { type: string; serverId?: string }) => {
		createdTasks.push(opts);
		return { id: `task-${createdTasks.length}` };
	},
);
const mockGetActiveTasks = mock(async () => activeTasks);
const mockDeleteTask = mock(async (id: string) => {
	deletedTaskIds.push(id);
});
// Re-export the real module's other exports so files sharing this Bun process
// keep working if the mock leaks (same pattern as the schema mocks).
const realTaskManager = await import("../../taskManager");
mock.module("../../taskManager", () => ({
	...realTaskManager,
	createTask: mockCreateTask,
	getActiveTasks: mockGetActiveTasks,
	deleteTask: mockDeleteTask,
}));

const { recommendationsQueue } = await import(
	"../../../infrastructure/queue/queues/recommendations.queue"
);
const { settingsRepository } = await import(
	"../../../routers/settings/settings.repository"
);
const {
	startServerRecommendationFeedsRefresh,
	startServerRecommendationRebuild,
} = await import("../recommendation.tasks");

// Singletons are patched in place (mock.module leaks across test files).
const originalAdd = recommendationsQueue.add.bind(recommendationsQueue);
const originalGetOrgValue =
	settingsRepository.getOrgValue.bind(settingsRepository);

let added: { name: string; data: unknown; opts: Record<string, unknown> }[] =
	[];
let orgSettings = new Map<string, unknown>();

beforeEach(() => {
	added = [];
	orgSettings = new Map();
	activeTasks = [];
	createdTasks = [];
	deletedTaskIds = [];
	mockCreateTask.mockClear();

	recommendationsQueue.add = (async (
		name: string,
		data: unknown,
		opts: Record<string, unknown>,
	) => {
		added.push({ name, data, opts });
		return {} as never;
	}) as typeof recommendationsQueue.add;
	settingsRepository.getOrgValue = (async (serverId: string, key: string) =>
		orgSettings.get(
			`${serverId}:${key}`,
		)) as typeof settingsRepository.getOrgValue;
});

afterEach(() => {
	recommendationsQueue.add = originalAdd;
	settingsRepository.getOrgValue = originalGetOrgValue;
});

describe("startServerRecommendationFeedsRefresh", () => {
	test("creates a recommendations-feeds task and an unprioritized refresh-feeds job", async () => {
		const result = await startServerRecommendationFeedsRefresh(
			"org-a",
			"user-1",
		);
		expect(result.started).toBe(true);
		expect(createdTasks[0]?.type).toBe("recommendations-feeds");
		expect(createdTasks[0]?.serverId).toBe("org-a");
		expect(added.length).toBe(1);
		expect(added[0]?.name).toBe("refresh-feeds");
		expect(added[0]?.data).toEqual({ serverId: "org-a", taskId: "task-1" });
		// unprioritized on purpose: jumps ahead of queued full rebuilds
		expect(added[0]?.opts.priority).toBeUndefined();
	});

	test("refuses when recommendations are disabled", async () => {
		orgSettings.set("org-a:recommendations", { enabled: false });
		const result = await startServerRecommendationFeedsRefresh("org-a");
		expect(result).toEqual({ started: false, count: 0, reason: "disabled" });
		expect(added).toEqual([]);
	});

	test("refuses when only similar titles are enabled", async () => {
		orgSettings.set("org-a:recommendations", {
			enabled: true,
			personalizedEnabled: false,
			similarEnabled: true,
		});
		const result = await startServerRecommendationFeedsRefresh("org-a");
		expect(result).toEqual({ started: false, count: 0, reason: "disabled" });
		expect(added).toEqual([]);
	});

	test("refuses while a rebuild for the same server is running", async () => {
		activeTasks = [
			{ status: "running", type: "recommendations-rebuild", serverId: "org-a" },
		];
		const result = await startServerRecommendationFeedsRefresh("org-a");
		expect(result).toEqual({
			started: false,
			count: 0,
			reason: "already-running",
		});
	});

	test("a running feeds refresh on another server does not block", async () => {
		activeTasks = [
			{ status: "running", type: "recommendations-feeds", serverId: "org-b" },
		];
		const result = await startServerRecommendationFeedsRefresh("org-a");
		expect(result.started).toBe(true);
	});

	test("deletes the task when enqueueing fails", async () => {
		recommendationsQueue.add = (async () => {
			throw new Error("redis down");
		}) as typeof recommendationsQueue.add;
		await expect(
			startServerRecommendationFeedsRefresh("org-a"),
		).rejects.toThrow("redis down");
		expect(deletedTaskIds).toEqual(["task-1"]);
	});
});

describe("startServerRecommendationRebuild", () => {
	test("enqueues a full rebuild with the rebuild priority", async () => {
		const result = await startServerRecommendationRebuild("org-a", "user-1");
		expect(result.started).toBe(true);
		expect(createdTasks[0]?.type).toBe("recommendations-rebuild");
		expect(added[0]?.name).toBe("rebuild-server");
		expect(added[0]?.opts.priority).toBe(10);
		expect(added[0]?.data).toEqual({
			serverId: "org-a",
			full: true,
			taskId: "task-1",
		});
	});

	test("remains available when only similar titles are enabled", async () => {
		orgSettings.set("org-a:recommendations", {
			enabled: true,
			personalizedEnabled: false,
			similarEnabled: true,
		});
		const result = await startServerRecommendationRebuild("org-a");
		expect(result.started).toBe(true);
		expect(added[0]?.name).toBe("rebuild-server");
	});

	test("refuses while a feeds refresh for the same server is running", async () => {
		activeTasks = [
			{ status: "running", type: "recommendations-feeds", serverId: "org-a" },
		];
		const result = await startServerRecommendationRebuild("org-a");
		expect(result).toEqual({
			started: false,
			count: 0,
			reason: "already-running",
		});
	});

	test("refuses while a global rebuild is running", async () => {
		activeTasks = [
			{ status: "running", type: "recommendations-rebuild-global" },
		];
		const result = await startServerRecommendationRebuild("org-a");
		expect(result).toEqual({
			started: false,
			count: 0,
			reason: "already-running",
		});
	});
});
