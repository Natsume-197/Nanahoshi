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
	},
	Worker: class {
		on() {}
		close = async () => {};
	},
}));

const { recommendationsQueue } = await import(
	"../../../infrastructure/queue/queues/recommendations.queue"
);
const { settingsRepository } = await import(
	"../../../routers/settings/settings.repository"
);
const { recommendationComputeRepository } = await import(
	"../recommendation-compute.repository"
);
const { enqueueRebuild, enqueueUserRefresh, reconcileRecommendationSchedules } =
	await import("../recommendation.scheduler");

// Singletons are patched in place (mock.module leaks across test files).
const originalUpsert =
	recommendationsQueue.upsertJobScheduler.bind(recommendationsQueue);
const originalRemove =
	recommendationsQueue.removeJobScheduler.bind(recommendationsQueue);
const originalGet =
	recommendationsQueue.getJobSchedulers.bind(recommendationsQueue);
const originalAdd = recommendationsQueue.add.bind(recommendationsQueue);
const originalListOrgs =
	recommendationComputeRepository.listOrganizationIds.bind(
		recommendationComputeRepository,
	);
const originalGetOrgValue =
	settingsRepository.getOrgValue.bind(settingsRepository);

let upserted: { id: string; repeat: unknown; template: unknown }[] = [];
let removed: string[] = [];
let added: { name: string; data: unknown; opts: Record<string, unknown> }[] =
	[];
let existingSchedulers: { key: string }[] = [];
let orgIds: string[] = [];
let orgSettings = new Map<string, unknown>();

beforeEach(() => {
	upserted = [];
	removed = [];
	added = [];
	existingSchedulers = [];
	orgIds = [];
	orgSettings = new Map();

	recommendationsQueue.upsertJobScheduler = (async (
		id: string,
		repeat: unknown,
		template: unknown,
	) => {
		upserted.push({ id, repeat, template });
		return {} as never;
	}) as typeof recommendationsQueue.upsertJobScheduler;
	recommendationsQueue.removeJobScheduler = (async (id: string) => {
		removed.push(id);
		return true;
	}) as typeof recommendationsQueue.removeJobScheduler;
	recommendationsQueue.getJobSchedulers = (async () =>
		existingSchedulers) as typeof recommendationsQueue.getJobSchedulers;
	recommendationsQueue.add = (async (
		name: string,
		data: unknown,
		opts: Record<string, unknown>,
	) => {
		added.push({ name, data, opts });
		return {} as never;
	}) as typeof recommendationsQueue.add;
	recommendationComputeRepository.listOrganizationIds = async () => orgIds;
	settingsRepository.getOrgValue = (async (serverId: string, key: string) =>
		orgSettings.get(
			`${serverId}:${key}`,
		)) as typeof settingsRepository.getOrgValue;
});

afterEach(() => {
	recommendationsQueue.upsertJobScheduler = originalUpsert;
	recommendationsQueue.removeJobScheduler = originalRemove;
	recommendationsQueue.getJobSchedulers = originalGet;
	recommendationsQueue.add = originalAdd;
	recommendationComputeRepository.listOrganizationIds = originalListOrgs;
	settingsRepository.getOrgValue = originalGetOrgValue;
});

describe("reconcileRecommendationSchedules", () => {
	test("registers nightly and weekly schedulers per enabled org", async () => {
		orgIds = ["org-a", "org-b"];
		await reconcileRecommendationSchedules();
		const ids = upserted.map((u) => u.id).sort();
		expect(ids).toEqual([
			"recs-full-org-a",
			"recs-full-org-b",
			"recs-org-a",
			"recs-org-b",
		]);
		expect(upserted.find((u) => u.id === "recs-org-a")?.repeat).toEqual({
			pattern: "30 3 * * 1-6",
		});
		expect(upserted.find((u) => u.id === "recs-full-org-a")?.repeat).toEqual({
			pattern: "0 4 * * 0",
		});
	});

	test("scheduled rebuilds carry the rebuild priority", async () => {
		orgIds = ["org-a"];
		await reconcileRecommendationSchedules();
		for (const u of upserted) {
			expect(
				(u.template as { opts: { priority?: number } }).opts.priority,
			).toBe(10);
		}
	});

	test("skips disabled orgs and drops their stale schedulers", async () => {
		orgIds = ["org-a", "org-off"];
		orgSettings.set("org-off:recommendations", { enabled: false });
		existingSchedulers = [
			{ key: "recs-org-off" },
			{ key: "recs-full-org-off" },
		];
		await reconcileRecommendationSchedules();
		expect(upserted.map((u) => u.id)).not.toContain("recs-org-off");
		expect(removed.sort()).toEqual(["recs-full-org-off", "recs-org-off"]);
	});

	test("drops schedulers for deleted orgs", async () => {
		orgIds = ["org-a"];
		existingSchedulers = [{ key: "recs-org-gone" }];
		await reconcileRecommendationSchedules();
		expect(removed).toContain("recs-org-gone");
	});
});

describe("debounced enqueues", () => {
	test("user refresh uses a stable jobId, delay, and removeOnComplete", async () => {
		await enqueueUserRefresh("org-a", "user-1");
		expect(added.length).toBe(1);
		const job = added[0];
		expect(job?.name).toBe("refresh-user");
		expect(job?.opts.jobId).toBe("recs-user-org-a-user-1");
		expect(job?.opts.delay).toBeGreaterThan(0);
		// required so the jobId can be reused after completion (coalescing debounce)
		expect(job?.opts.removeOnComplete).toBe(true);
		// unprioritized on purpose: BullMQ picks it before prioritized rebuilds
		expect(job?.opts.priority).toBeUndefined();
	});

	test("rebuild enqueue uses a stable jobId and the rebuild priority", async () => {
		await enqueueRebuild("org-a");
		expect(added[0]?.opts.jobId).toBe("recs-rebuild-org-a");
		expect(added[0]?.opts.priority).toBe(10);
	});
});
