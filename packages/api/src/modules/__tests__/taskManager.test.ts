import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Behavioral tests for the task lifecycle around scan auto-enrich: cancelling
 * a scan must never resurrect (or orphan) its enrich task, missing tasks count
 * as cancelled, and reconcile seals orphaned children.
 *
 * Run with:
 *   bun test packages/api/src/modules/__tests__/taskManager.test.ts
 */

// Benign mocks so importing taskManager doesn't open Redis/queue connections.
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));
class MockRedis {
	options = {};
	on() {}
	subscribe() {
		return Promise.resolve();
	}
	publish() {
		return Promise.resolve(0);
	}
}

mock.module("ioredis", () => ({
	Redis: MockRedis,
	default: MockRedis,
}));
mock.module("bullmq", () => ({
	Queue: class {
		on() {}
		getJobs() {
			return Promise.resolve([]);
		}
		add() {
			return Promise.resolve({});
		}
		addBulk() {
			return Promise.resolve([]);
		}
	},
	QueueEvents: class {
		on() {}
	},
	Worker: class {
		on() {}
	},
}));

// In-memory Redis covering exactly the commands taskManager uses, including a
// JS re-implementation of its Lua scripts (dispatched by script contents).
class FakeRedis {
	hashes = new Map<string, Map<string, string>>();
	sets = new Map<string, Set<string>>();
	kv = new Map<string, string>();
	published: string[] = [];
	expirations: Array<{ key: string; seconds: number }> = [];
	hsetError: Error | null = null;
	/** Test hook: runs before every SET, to simulate races. */
	beforeSet: (() => void) | null = null;
	pipelineExecutions = 0;

	clear() {
		this.hashes.clear();
		this.sets.clear();
		this.kv.clear();
		this.published = [];
		this.expirations = [];
		this.hsetError = null;
		this.beforeSet = null;
		this.pipelineExecutions = 0;
	}

	pipeline() {
		const hashKeys: string[] = [];
		const chain = {
			hgetall: (key: string) => {
				hashKeys.push(key);
				return chain;
			},
			exec: async () => {
				this.pipelineExecutions++;
				return hashKeys.map(
					(key) =>
						[null, Object.fromEntries(this.hashes.get(key) ?? [])] as const,
				);
			},
		};
		return chain;
	}

	async hset(key: string, obj: Record<string, string>) {
		if (this.hsetError) throw this.hsetError;
		const hash = this.hashes.get(key) ?? new Map<string, string>();
		for (const [field, value] of Object.entries(obj)) hash.set(field, value);
		this.hashes.set(key, hash);
		return Object.keys(obj).length;
	}

	async hget(key: string, field: string) {
		return this.hashes.get(key)?.get(field) ?? null;
	}

	async hgetall(key: string) {
		return Object.fromEntries(this.hashes.get(key) ?? []);
	}

	private hincrby(key: string, field: string, by: number) {
		const hash = this.hashes.get(key) ?? new Map<string, string>();
		const next = Number(hash.get(field) ?? 0) + by;
		hash.set(field, String(next));
		this.hashes.set(key, hash);
		return next;
	}

	async sadd(key: string, ...members: string[]) {
		const set = this.sets.get(key) ?? new Set<string>();
		let added = 0;
		for (const m of members) {
			if (!set.has(m)) {
				set.add(m);
				added++;
			}
		}
		this.sets.set(key, set);
		return added;
	}

	async srem(key: string, ...members: string[]) {
		const set = this.sets.get(key);
		if (!set) return 0;
		let removed = 0;
		for (const m of members) if (set.delete(m)) removed++;
		return removed;
	}

	async smembers(key: string) {
		return [...(this.sets.get(key) ?? [])];
	}

	async get(key: string) {
		return this.kv.get(key) ?? null;
	}

	async set(key: string, value: string, ...opts: (string | number)[]) {
		this.beforeSet?.();
		if (opts.includes("NX") && this.kv.has(key)) return null;
		this.kv.set(key, value);
		return "OK";
	}

	async del(...keys: string[]) {
		let deleted = 0;
		for (const key of keys) {
			if (
				this.hashes.delete(key) ||
				this.sets.delete(key) ||
				this.kv.delete(key)
			) {
				deleted++;
			}
		}
		return deleted;
	}

	async expire(key: string, seconds: number) {
		this.expirations.push({ key, seconds });
		return 1;
	}

	async publish(_channel: string, message: string) {
		this.published.push(message);
		return 0;
	}

	async eval(script: string, numKeys: number, ...rest: (string | number)[]) {
		const keys = rest.slice(0, numKeys).map(String);
		const argv = rest.slice(numKeys).map(String);
		const status = this.hashes.get(keys[0] as string)?.get("status");

		// PLAN_JOBS: add each producer source to the known final total once.
		if (script.includes("PLAN_JOBS")) {
			if (status !== "running") return 0;
			const sources = this.hashes.get(keys[1] as string) ?? new Map();
			if (sources.has(argv[0] as string)) return 0;
			sources.set(argv[0] as string, argv[1] as string);
			this.hashes.set(keys[1] as string, sources);
			const task = this.hashes.get(keys[0] as string);
			const planned = Number(task?.get("plannedJobs") ?? 0);
			const reserved = Number(task?.get("totalJobs") ?? 0);
			task?.set(
				"plannedJobs",
				String(Math.max(planned, reserved) + Number(argv[1])),
			);
			return 1;
		}

		// RESERVE_JOBS: idempotently reserve stable scan job ids.
		if (script.includes("RESERVE_JOBS")) {
			if (status !== "running") return 0;
			let added = 0;
			for (const jobKey of argv) {
				added += await this.sadd(keys[1] as string, jobKey);
			}
			if (added === 0) return 0;
			this.hincrby(keys[0] as string, "totalJobs", added);
			this.hincrby(keys[0] as string, "outstanding", added);
			return added;
		}
		// BUMP: idempotent completed/failed counter + outstanding decrement.
		if (script.includes("SADD")) {
			if (status !== "running") return null;
			if ((await this.sadd(keys[1] as string, argv[0] as string)) === 0) {
				return null;
			}
			this.hincrby(keys[0] as string, argv[1] as string, 1);
			const outstanding = this.hincrby(keys[0] as string, "outstanding", -1);
			const sealed = this.hashes.get(keys[0] as string)?.get("sealed") ?? "0";
			return [outstanding, sealed];
		}
		// SEAL: mark totalJobs final, report outstanding.
		if (script.includes("'sealed', '1'")) {
			if (status !== "running") return [0, 0];
			this.hashes.get(keys[0] as string)?.set("sealed", "1");
			this.hashes
				.get(keys[0] as string)
				?.set(
					"plannedJobs",
					this.hashes.get(keys[0] as string)?.get("totalJobs") ?? "0",
				);
			return [1, this.hincrby(keys[0] as string, "outstanding", 0)];
		}
		// RESERVE: bump totalJobs/outstanding ahead of enqueue.
		if (script.includes("totalJobs")) {
			if (status !== "running") return 0;
			this.hincrby(keys[0] as string, "totalJobs", Number(argv[0]));
			this.hincrby(keys[0] as string, "outstanding", Number(argv[0]));
			return 1;
		}
		// FINISH: CAS running → terminal.
		if (status !== "running") return 0;
		this.hashes.get(keys[0] as string)?.set("status", argv[0] as string);
		this.hashes.get(keys[0] as string)?.set("finishedAt", argv[1] as string);
		this.hashes.get(keys[0] as string)?.set("reason", argv[2] as string);
		return 1;
	}
}

const fakeRedis = new FakeRedis();
mock.module("../../infrastructure/queue/redis", () => ({ redis: fakeRedis }));

// Queue stubs: file-events keeps observable jobs for producer recovery tests;
// the remaining queues only need taskManager's listing surface.
let fileEventJobs: Array<{
	name: string;
	data: Record<string, unknown>;
	opts?: { jobId?: string };
}> = [];
let fileEventAddBulkFailure: Error | null = null;
let fileEventAddBulkFailsAfterPersist = false;
const fileEventQueueStub = {
	getJobs: async () => [],
	getJobCountByTypes: async () => 0,
	add: async () => ({}),
	addBulk: async (jobs: typeof fileEventJobs) => {
		if (fileEventAddBulkFailure && !fileEventAddBulkFailsAfterPersist) {
			const failure = fileEventAddBulkFailure;
			fileEventAddBulkFailure = null;
			throw failure;
		}
		for (const job of jobs) {
			if (
				job.opts?.jobId &&
				fileEventJobs.some((queued) => queued.opts?.jobId === job.opts?.jobId)
			) {
				continue;
			}
			fileEventJobs.push(job);
		}
		if (fileEventAddBulkFailure) {
			const failure = fileEventAddBulkFailure;
			fileEventAddBulkFailure = null;
			throw failure;
		}
		return [];
	},
};
const emptyQueue = () => ({
	getJobs: async () => [],
	add: async () => ({}),
	addBulk: async () => [],
});
mock.module("../../infrastructure/queue/queues/file-event.queue", () => ({
	fileEventQueue: fileEventQueueStub,
}));
mock.module("../../infrastructure/queue/queues/metadata-enrich.queue", () => ({
	metadataEnrichQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/send-to-kindle.queue", () => ({
	sendToKindleQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/ranobedb-import.queue", () => ({
	ranobedbImportQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/cover-ingest.queue", () => ({
	coverIngestQueue: emptyQueue(),
}));
const mockEmitTaskFinished = mock(() => Promise.resolve());
mock.module("../../routers/notifications/notification.service", () => ({
	emitTaskFinished: mockEmitTaskFinished,
}));

const {
	bumpCompleted,
	cancelTask,
	createTask,
	failTask,
	finalizeTask,
	getActiveTasks,
	getAllTasks,
	getOrCreateScanEnrichTask,
	getTask,
	getTaskPayload,
	isTaskCancelled,
	planJobs,
	reconcileTask,
	reportScanProgress,
	reserve,
} = await import("../taskManager");
const { enqueueScanJobs } = await import("../scanning/scan-queue-producer");

beforeEach(() => {
	fakeRedis.clear();
	fileEventJobs = [];
	fileEventAddBulkFailure = null;
	fileEventAddBulkFailsAfterPersist = false;
	mockEmitTaskFinished.mockClear();
});

describe("active task reads", () => {
	test("loads 1,000 active tasks in one Redis pipeline", async () => {
		await Promise.all(
			Array.from({ length: 1_000 }, (_, index) =>
				createTask({
					id: `honomiya-${index}`,
					type: "read-listen-generation",
					serverId: "s1",
					totalJobs: 1,
					sealed: true,
				}),
			),
		);

		const active = await getActiveTasks();

		expect(active).toHaveLength(1_000);
		expect(fakeRedis.pipelineExecutions).toBe(1);
	});
});

describe("scan queue producer recovery", () => {
	test("publishes the full known total without double-counting a resumed path", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		await reserve(task.id, 100);

		await planJobs(task.id, "ebook:51", 80_000);
		await planJobs(task.id, "ebook:51", 80_000);
		expect((await getTask(task.id))?.plannedJobs).toBe(80_100);

		await reserve(task.id, 80_000);
		await planJobs(task.id, "ebook:52", 20_000);
		expect((await getTask(task.id))?.plannedJobs).toBe(100_100);
	});

	test("reconciles the plan with the exact reserved total when production ends", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		await planJobs(task.id, "ebook:51", 80_000);
		await reserve(task.id, 2);

		await finalizeTask(task.id);

		expect(await getTask(task.id)).toMatchObject({
			sealed: true,
			totalJobs: 2,
			plannedJobs: 2,
		});
	});

	test("retrying after enqueue failure reserves and creates each job once", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		const jobs = ["one", "two"].map((path) => ({
			name: "file-event",
			data: {
				action: "add",
				path: `/library/${path}.epub`,
				libraryPathId: 7,
				taskId: task.id,
			},
		}));
		fileEventAddBulkFailure = new Error("queue connection lost");

		await expect(enqueueScanJobs(jobs, task.id)).rejects.toThrow(
			"queue connection lost",
		);
		await enqueueScanJobs(jobs, task.id);

		const recovered = await getTask(task.id);
		expect(recovered?.totalJobs).toBe(2);
		expect(fileEventJobs).toHaveLength(2);
		expect(fileEventJobs.every((job) => Boolean(job.opts?.jobId))).toBe(true);
	});

	test("retrying after a lost enqueue acknowledgement does not duplicate jobs", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		const jobs = ["one", "two"].map((path) => ({
			name: "file-event",
			data: {
				action: "add",
				path: `/library/${path}.epub`,
				libraryPathId: 7,
				taskId: task.id,
			},
		}));
		fileEventAddBulkFailure = new Error("queue acknowledgement lost");
		fileEventAddBulkFailsAfterPersist = true;

		await expect(enqueueScanJobs(jobs, task.id)).rejects.toThrow(
			"queue acknowledgement lost",
		);
		await enqueueScanJobs(jobs, task.id);

		const recovered = await getTask(task.id);
		expect(recovered?.totalJobs).toBe(2);
		expect(fileEventJobs).toHaveLength(2);
		expect(new Set(fileEventJobs.map((job) => job.opts?.jobId)).size).toBe(2);
	});
});

describe("task failure", () => {
	test("moves a running task to recent with its reason and publishes immediately", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		fakeRedis.published = [];
		const beforeFailure = Date.now();

		await failTask(task.id, "Library path is unavailable");

		const failed = await getTask(task.id);
		expect(failed?.status).toBe("failed");
		expect(failed?.reason).toBe("Library path is unavailable");
		expect(failed?.finishedAt).toBeGreaterThanOrEqual(beforeFailure);
		expect(await getActiveTasks()).toHaveLength(0);
		expect((await getAllTasks()).map((recent) => recent.id)).toContain(task.id);
		expect(fakeRedis.published).toHaveLength(1);
		expect(JSON.parse(fakeRedis.published[0] ?? "{}")).toMatchObject({
			id: task.id,
			status: "failed",
			reason: "Library path is unavailable",
		});
		expect(mockEmitTaskFinished).not.toHaveBeenCalled();
		expect(fakeRedis.expirations).toContainEqual({
			key: `task:${task.id}`,
			seconds: 7 * 24 * 60 * 60,
		});
	});

	test("failure transition is idempotent and preserves the first reason", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		fakeRedis.published = [];

		await failTask(task.id, "first failure");
		await failTask(task.id, "later failure");

		expect((await getTask(task.id))?.reason).toBe("first failure");
		expect(fakeRedis.published).toHaveLength(1);
		expect(mockEmitTaskFinished).not.toHaveBeenCalled();
	});

	test("parses an optional failure reason from Redis", async () => {
		await fakeRedis.hset("task:legacy-failed", {
			id: "legacy-failed",
			type: "library-scan",
			status: "failed",
			reason: "worker stopped",
		});

		expect(await getTask("legacy-failed")).toMatchObject({
			status: "failed",
			reason: "worker stopped",
		});
	});
});

describe("task payload", () => {
	test("stores the original payload separately from task events", async () => {
		const payload = { libraryId: 12, mode: "incremental" };
		const task = await createTask({
			type: "library-scan",
			serverId: "s1",
			payload,
		});

		expect(await getTaskPayload(task.id)).toEqual(payload);
		expect(task).not.toHaveProperty("payload");
	});

	test("returns null for legacy jobs without a payload", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		expect(await getTaskPayload(task.id)).toBeNull();
	});
});

describe("scan progress projection", () => {
	const progress = {
		phase: "discovery" as const,
		discovered: 10,
		statted: 8,
		hashed: 4,
		persisted: 4,
		errors: 0,
		statConcurrency: 32,
		hashConcurrency: 8,
		throughput: 2.5,
		lastProgressAt: 1_000,
	};

	test("serializes optional durable counters and leaves legacy tasks compatible", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		await reportScanProgress(scan.id, progress, true);

		expect((await getTask(scan.id))?.scanProgress).toEqual(progress);
		const generic = await createTask({
			type: "library-upload",
			serverId: "s1",
		});
		expect(await getTask(generic.id)).not.toHaveProperty("scanProgress");
	});

	test("coalesces same-phase updates and terminal transitions flush the latest", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		await reportScanProgress(scan.id, progress, true);
		fakeRedis.published = [];

		await reportScanProgress(scan.id, {
			...progress,
			persisted: 7,
			lastProgressAt: 2_000,
		});
		expect(fakeRedis.published).toHaveLength(0);
		expect(
			JSON.parse(
				(await fakeRedis.hget(`task:${scan.id}`, "scanProgress")) ?? "{}",
			),
		).toMatchObject({ persisted: 4 });

		await failTask(scan.id, "scan stopped");
		expect(fakeRedis.published).toHaveLength(1);
		expect(JSON.parse(fakeRedis.published[0] ?? "{}")).toMatchObject({
			status: "failed",
			scanProgress: { persisted: 7 },
		});
	});

	test("flushes phase transitions immediately", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		await reportScanProgress(scan.id, progress, true);
		fakeRedis.published = [];

		await reportScanProgress(scan.id, { ...progress, phase: "prune" });

		expect(fakeRedis.published).toHaveLength(1);
		expect(JSON.parse(fakeRedis.published[0] ?? "{}")).toMatchObject({
			scanProgress: { phase: "prune" },
		});
	});

	test("never fails the scan when its Redis projection is unavailable", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		fakeRedis.hsetError = new Error("Redis unavailable");

		await expect(reportScanProgress(scan.id, progress, true)).resolves.toBe(
			undefined,
		);
	});
});

describe("getOrCreateScanEnrichTask", () => {
	test("creates one enrich task per running scan and reuses it", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		const first = await getOrCreateScanEnrichTask(scan.id, "s1");
		const second = await getOrCreateScanEnrichTask(scan.id, "s1");

		expect(first).not.toBeNull();
		expect(second).toBe(first);
		expect((await getTask(first as string))?.type).toBe("metadata-enrich-auto");
	});

	test("does not resurrect the enrich task after the scan is cancelled", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		const enrichId = await getOrCreateScanEnrichTask(scan.id, "s1");

		await cancelTask(scan.id);
		// In-flight scan jobs land here after the cancel cleanup already ran.
		const resurrected = await getOrCreateScanEnrichTask(scan.id, "s1");

		expect(resurrected).toBeNull();
		// The scan's cleanup sealed the (empty) enrich task, finishing it.
		expect((await getTask(enrichId as string))?.status).toBe("completed");
		expect(await getActiveTasks()).toHaveLength(0);
	});

	test("returns null for a scan that never had a task", async () => {
		expect(await getOrCreateScanEnrichTask("missing-scan", "s1")).toBeNull();
		expect(await getActiveTasks()).toHaveLength(0);
	});

	test("undoes creation when the scan finishes during the race", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		// Simulate the scan finishing (cleanup included) between the status check
		// and the SET NX claiming the enrich key.
		fakeRedis.beforeSet = () => {
			fakeRedis.hashes.get(`task:${scan.id}`)?.set("status", "cancelled");
			fakeRedis.beforeSet = null;
		};

		const result = await getOrCreateScanEnrichTask(scan.id, "s1");

		expect(result).toBeNull();
		expect(fakeRedis.kv.has(`scan:${scan.id}:enrich`)).toBe(false);
		const active = await getActiveTasks();
		expect(
			active.filter((t) => t.type === "metadata-enrich-auto"),
		).toHaveLength(0);
	});

	test("enrich task sealed by scan cancel finishes once its jobs drain", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		const enrichId = (await getOrCreateScanEnrichTask(scan.id, "s1")) as string;
		await reserve(enrichId, 2);

		await cancelTask(scan.id);
		expect((await getTask(enrichId))?.status).toBe("running");

		await bumpCompleted(enrichId, "job-1");
		await bumpCompleted(enrichId, "job-2");
		expect((await getTask(enrichId))?.status).toBe("completed");
	});
});

describe("isTaskCancelled", () => {
	test("treats a missing task as cancelled", async () => {
		expect(await isTaskCancelled("deleted-or-expired")).toBe(true);
	});

	test("reflects the stored status otherwise", async () => {
		const task = await createTask({ type: "library-scan", serverId: "s1" });
		expect(await isTaskCancelled(task.id)).toBe(false);
		expect((await getTask(task.id))?.finishedAt).toBeNull();
		const beforeCancel = Date.now();
		await cancelTask(task.id);
		expect(await isTaskCancelled(task.id)).toBe(true);
		expect((await getTask(task.id))?.finishedAt).toBeGreaterThanOrEqual(
			beforeCancel,
		);
	});
});

describe("reconcileTask", () => {
	test("leaves an unsealed child alone while its parent runs", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		const child = await createTask({
			type: "metadata-enrich-auto",
			serverId: "s1",
			parentTaskId: scan.id,
		});
		await reserve(child.id, 1);

		await reconcileTask(child.id);

		const after = await getTask(child.id);
		expect(after?.status).toBe("running");
		expect(after?.sealed).toBe(false);
	});

	test("seals an orphaned child, then finishes it when no jobs remain", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		const child = await createTask({
			type: "metadata-enrich-auto",
			serverId: "s1",
			parentTaskId: scan.id,
		});
		await reserve(child.id, 1);
		await cancelTask(scan.id);

		await reconcileTask(child.id);
		const sealed = await getTask(child.id);
		expect(sealed?.sealed).toBe(true);
		expect(sealed?.status).toBe("running");

		// Next sweep: sealed, outstanding > 0, but its queue has no live jobs.
		await reconcileTask(child.id);
		expect((await getTask(child.id))?.status).toBe("completed");
	});

	test("never touches an unsealed task without a parent", async () => {
		const scan = await createTask({ type: "library-scan", serverId: "s1" });
		await reserve(scan.id, 3);

		await reconcileTask(scan.id);

		expect((await getTask(scan.id))?.status).toBe("running");
	});
});
