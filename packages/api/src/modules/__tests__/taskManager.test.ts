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
	/** Test hook: runs before every SET, to simulate races. */
	beforeSet: (() => void) | null = null;

	clear() {
		this.hashes.clear();
		this.sets.clear();
		this.kv.clear();
		this.beforeSet = null;
	}

	async hset(key: string, obj: Record<string, string>) {
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

	async expire() {
		return 1;
	}

	async publish() {
		return 0;
	}

	async eval(script: string, numKeys: number, ...rest: (string | number)[]) {
		const keys = rest.slice(0, numKeys).map(String);
		const argv = rest.slice(numKeys).map(String);
		const status = this.hashes.get(keys[0] as string)?.get("status");

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
		return 1;
	}
}

const fakeRedis = new FakeRedis();
mock.module("../../infrastructure/queue/redis", () => ({ redis: fakeRedis }));

// Queue stubs: taskManager only lists live jobs (cancel/reconcile) here.
const emptyQueue = () => ({
	getJobs: async () => [],
	add: async () => ({}),
	addBulk: async () => [],
});
mock.module("../../infrastructure/queue/queues/file-event.queue", () => ({
	fileEventQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/metadata-enrich.queue", () => ({
	metadataEnrichQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/book-index.queue", () => ({
	bookIndexQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/send-to-kindle.queue", () => ({
	sendToKindleQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/ranobedb-import.queue", () => ({
	ranobedbImportQueue: emptyQueue(),
}));
mock.module("../../infrastructure/queue/queues/cover-color.queue", () => ({
	coverColorQueue: emptyQueue(),
}));

const {
	bumpCompleted,
	cancelTask,
	createTask,
	getActiveTasks,
	getOrCreateScanEnrichTask,
	getTask,
	isTaskCancelled,
	reconcileTask,
	reserve,
} = await import("../taskManager");

beforeEach(() => {
	fakeRedis.clear();
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
		await cancelTask(task.id);
		expect(await isTaskCancelled(task.id)).toBe(true);
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
