import type { Queue } from "bullmq";
import { Redis } from "ioredis";
import { bookIndexQueue } from "../infrastructure/queue/queues/book-index.queue";
import { coverColorQueue } from "../infrastructure/queue/queues/cover-color.queue";
import { fileEventQueue } from "../infrastructure/queue/queues/file-event.queue";
import { metadataEnrichQueue } from "../infrastructure/queue/queues/metadata-enrich.queue";
import { ranobedbImportQueue } from "../infrastructure/queue/queues/ranobedb-import.queue";
import { sendToKindleQueue } from "../infrastructure/queue/queues/send-to-kindle.queue";
import { redis } from "../infrastructure/queue/redis";
import { logger } from "../lib/logger";
import {
	type QueueName,
	TASK_REGISTRY,
	type TaskType,
} from "./tasks/task-registry";

const log = logger.child({ component: "task-manager" });

const TASK_CHANNEL = "task:updates";

// The concrete BullMQ queue behind each registry queue name. Lives here (not in
// the registry) so the registry stays free of server-only imports.
const QUEUES_BY_NAME: Record<QueueName, Queue> = {
	"file-events": fileEventQueue,
	"metadata-enrich": metadataEnrichQueue,
	"book-index": bookIndexQueue,
	"send-to-kindle": sendToKindleQueue,
	"ranobedb-import": ranobedbImportQueue,
	"cover-color": coverColorQueue,
};

function queueForTask(task: Task): Queue | undefined {
	const def = TASK_REGISTRY[task.type as TaskType];
	return def ? QUEUES_BY_NAME[def.queue] : undefined;
}

export interface Task {
	id: string;
	type: string;
	/** Owning server (better-auth organization). `null` = global app-admin task. */
	serverId: string | null;
	label: string;
	status: "running" | "completed" | "cancelled";
	totalJobs: number;
	completedJobs: number;
	failedJobs: number;
	createdAt: number;
	/** True once totalJobs is final; an unsealed task can't finish on counters alone. */
	sealed: boolean;
}

/** Who is asking for tasks — drives per-server visibility filtering. */
export interface TaskScope {
	serverId: string | null;
	isAppOwner: boolean;
}

export function taskVisibleTo(task: Task, scope: TaskScope): boolean {
	if (task.serverId === scope.serverId) return true;
	return scope.isAppOwner && task.serverId === null;
}

const TASK_KEY = (id: string) => `task:${id}`;
// Per-task set of job keys already counted, making increments idempotent so a
// redelivered queue event (or a worker restart) can never double-count.
const SEEN_KEY = (id: string) => `task:${id}:seen`;
const ACTIVE_TASKS_KEY = "active_tasks";
const RECENT_TASKS_KEY = "recent_tasks";
const DONE_TTL = 3600; // 1 hour
const SEEN_TTL = 86400; // 24h safety net for abandoned tasks

// ── Pub/sub ─────────────────────────────────────────────────────────────────

function publishUpdate(task: Task): void {
	redis.publish(TASK_CHANNEL, JSON.stringify(task)).catch(() => {});
}

export function subscribeToTaskUpdates(
	onMessage: (task: Task) => void,
): () => void {
	const sub = new Redis(redis.options);
	sub.subscribe(TASK_CHANNEL).catch(() => {});
	sub.on("message", (_channel: string, message: string) => {
		try {
			onMessage(JSON.parse(message) as Task);
		} catch {}
	});
	return () => {
		sub.unsubscribe(TASK_CHANNEL).catch(() => {});
		sub.disconnect();
	};
}

// Coalesce bursty progress to one publish per window; transitions flush at once.
const PUBLISH_THROTTLE_MS = 500;
const pendingPublish = new Map<string, ReturnType<typeof setTimeout>>();

function schedulePublish(taskId: string): void {
	if (pendingPublish.has(taskId)) return;
	const timer = setTimeout(() => {
		pendingPublish.delete(taskId);
		getTask(taskId)
			.then((task) => {
				if (task) publishUpdate(task);
			})
			.catch(() => {});
	}, PUBLISH_THROTTLE_MS);
	pendingPublish.set(taskId, timer);
}

function flushPublish(task: Task): void {
	const timer = pendingPublish.get(task.id);
	if (timer) {
		clearTimeout(timer);
		pendingPublish.delete(task.id);
	}
	publishUpdate(task);
}

// ── Creation & retrieval ──────────────────────────────────────────────────────

export async function createTask(opts: {
	type: TaskType;
	/** Required for "server"-scoped types; ignored (forced null) for "global". */
	serverId?: string | null;
	label?: string;
	totalJobs?: number;
	/** Pass true when every job is enqueued right after creation. */
	sealed?: boolean;
}): Promise<Task> {
	const def = TASK_REGISTRY[opts.type];
	const id = crypto.randomUUID();
	const totalJobs = opts.totalJobs ?? 0;
	const task: Task = {
		id,
		type: opts.type,
		serverId: def.scope === "global" ? null : (opts.serverId ?? null),
		label: opts.label ?? def.defaultLabel,
		status: "running",
		totalJobs,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: Date.now(),
		sealed: opts.sealed ?? false,
	};

	await redis.hset(TASK_KEY(id), {
		id: task.id,
		type: task.type,
		serverId: task.serverId ?? "",
		label: task.label,
		status: task.status,
		totalJobs: String(task.totalJobs),
		completedJobs: "0",
		failedJobs: "0",
		// Jobs reserved but not yet terminal. Starts equal to totalJobs; the task
		// is done when it reaches zero (and is sealed).
		outstanding: String(totalJobs),
		createdAt: String(task.createdAt),
		sealed: task.sealed ? "1" : "0",
	});
	await redis.sadd(ACTIVE_TASKS_KEY, id);
	publishUpdate(task);

	return task;
}

export async function getTask(taskId: string): Promise<Task | null> {
	const data = await redis.hgetall(TASK_KEY(taskId));
	if (!data?.id) return null;
	return parseTask(data);
}

export async function getActiveTasks(scope?: TaskScope): Promise<Task[]> {
	const ids = await redis.smembers(ACTIVE_TASKS_KEY);
	if (ids.length === 0) return [];

	const tasks: Task[] = [];
	for (const id of ids) {
		const task = await getTask(id);
		if (task && (!scope || taskVisibleTo(task, scope))) tasks.push(task);
	}
	return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllTasks(scope?: TaskScope): Promise<Task[]> {
	const [activeIds, recentIds] = await Promise.all([
		redis.smembers(ACTIVE_TASKS_KEY),
		redis.smembers(RECENT_TASKS_KEY),
	]);
	const allIds = [...new Set([...activeIds, ...recentIds])];
	if (allIds.length === 0) return [];

	const tasks: Task[] = [];
	const expiredIds: string[] = [];
	for (const id of allIds) {
		const task = await getTask(id);
		if (task) {
			if (!scope || taskVisibleTo(task, scope)) tasks.push(task);
		} else {
			expiredIds.push(id);
		}
	}

	if (expiredIds.length > 0) {
		await Promise.all([
			redis.srem(ACTIVE_TASKS_KEY, ...expiredIds),
			redis.srem(RECENT_TASKS_KEY, ...expiredIds),
		]);
	}

	return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

// ── Progress: reserve + idempotent count ──────────────────────────────────────

const RESERVE_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'running' then return 0 end
redis.call('HINCRBY', KEYS[1], 'totalJobs', ARGV[1])
redis.call('HINCRBY', KEYS[1], 'outstanding', ARGV[1])
return 1
`;

/**
 * Reserve `count` jobs right before enqueuing them; reserving ahead of the work
 * keeps an unsealed task from transiently looking done mid-production.
 */
export async function reserve(taskId: string, count: number): Promise<void> {
	if (count <= 0) return;
	const reserved = (await redis.eval(
		RESERVE_SCRIPT,
		1,
		TASK_KEY(taskId),
		String(count),
	)) as number;
	if (reserved === 1) schedulePublish(taskId);
}

// Idempotent per (task, jobKey); returns [outstanding, sealed] for the finish check.
const BUMP_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'running' then return nil end
if redis.call('SADD', KEYS[2], ARGV[1]) == 0 then return nil end
redis.call('EXPIRE', KEYS[2], ARGV[3])
redis.call('HINCRBY', KEYS[1], ARGV[2], 1)
local outstanding = redis.call('HINCRBY', KEYS[1], 'outstanding', -1)
local sealed = redis.call('HGET', KEYS[1], 'sealed')
return {outstanding, sealed}
`;

async function bump(
	taskId: string,
	jobKey: string,
	field: "completedJobs" | "failedJobs",
): Promise<void> {
	const res = (await redis.eval(
		BUMP_SCRIPT,
		2,
		TASK_KEY(taskId),
		SEEN_KEY(taskId),
		jobKey,
		field,
		String(SEEN_TTL),
	)) as [number, string] | null;
	if (!res) return; // duplicate or task no longer running
	const [outstanding, sealed] = res;
	if (sealed === "1" && outstanding <= 0) {
		await finishTask(taskId, "completed");
	} else {
		schedulePublish(taskId);
	}
}

/** Count one job as completed. `jobKey` (BullMQ id or synthetic) dedupes repeats. */
export async function bumpCompleted(
	taskId: string,
	jobKey: string,
): Promise<void> {
	await bump(taskId, jobKey, "completedJobs");
}

export async function bumpFailed(
	taskId: string,
	jobKey: string,
): Promise<void> {
	await bump(taskId, jobKey, "failedJobs");
}

const SEAL_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'running' then return {0, 0} end
redis.call('HSET', KEYS[1], 'sealed', '1')
return {1, redis.call('HINCRBY', KEYS[1], 'outstanding', 0)}
`;

/** Seal a task (totalJobs final); finishes now if the counters already caught up. */
export async function finalizeTask(taskId: string): Promise<void> {
	const res = (await redis.eval(SEAL_SCRIPT, 1, TASK_KEY(taskId))) as [
		number,
		number,
	];
	if (res[0] !== 1) return;
	if (res[1] <= 0) {
		await finishTask(taskId, "completed");
		return;
	}
	const task = await getTask(taskId);
	if (task) flushPublish(task);
}

// ── Reconciliation (precision backstop) ───────────────────────────────────────

/**
 * Backstop for a lost increment event: finish a sealed task whose outstanding
 * hit zero, or whose queue has no live jobs left for it.
 */
export async function reconcileTask(taskId: string): Promise<void> {
	const task = await getTask(taskId);
	if (task?.status !== "running" || !task.sealed) return;

	const outstanding = Number(
		(await redis.hget(TASK_KEY(taskId), "outstanding")) ?? 0,
	);
	if (outstanding <= 0) {
		await finishTask(taskId, "completed");
		return;
	}

	const queue = queueForTask(task);
	if (!queue) return;
	const live = await queue.getJobs([
		"waiting",
		"active",
		"delayed",
		"prioritized",
		"waiting-children",
	]);
	const hasLive = live.some((job) => job.data?.taskId === taskId);
	if (!hasLive) {
		log.warn(
			{ taskId, outstanding },
			"Reconciled task with no live jobs — finishing",
		);
		await finishTask(taskId, "completed");
	}
}

/** Sweep every active task for the lost-event case. Run on a slow interval. */
export async function reconcileActiveTasks(): Promise<void> {
	const ids = await redis.smembers(ACTIVE_TASKS_KEY);
	await Promise.all(ids.map((id) => reconcileTask(id).catch(() => {})));
}

// ── Cancellation & deletion ───────────────────────────────────────────────────

export async function cancelTask(taskId: string): Promise<void> {
	await finishTask(taskId, "cancelled");

	removeWaitingJobs(taskId).catch((err) =>
		log.error({ err, taskId }, "Failed to remove waiting jobs"),
	);
}

async function removeWaitingJobs(taskId: string): Promise<void> {
	const task = await getTask(taskId);
	const queue = (task && queueForTask(task)) || fileEventQueue;
	const waitingJobs = await queue.getJobs([
		"waiting",
		"delayed",
		"prioritized",
	]);
	let removed = 0;
	for (const job of waitingJobs) {
		if (job.data?.taskId === taskId) {
			await job.remove().catch(() => {});
			removed++;
		}
	}
	if (removed > 0) {
		log.info({ removed, taskId }, "Removed waiting jobs for task");
	}
}

export async function deleteTask(taskId: string): Promise<void> {
	// Read serverId before deleting so the tombstone routes to the right clients.
	const existing = await getTask(taskId);
	await redis.del(TASK_KEY(taskId), SEEN_KEY(taskId));
	await redis.srem(ACTIVE_TASKS_KEY, taskId);
	await redis.srem(RECENT_TASKS_KEY, taskId);
	publishUpdate({
		id: taskId,
		type: "",
		serverId: existing?.serverId ?? null,
		label: "",
		status: "completed",
		totalJobs: 0,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: 0,
		sealed: true,
	});
}

export async function clearFinishedTasks(scope: TaskScope): Promise<void> {
	const recentIds = await redis.smembers(RECENT_TASKS_KEY);
	if (recentIds.length === 0) return;

	// Only clear the finished tasks this caller can see; leave other servers' be.
	const toClear: string[] = [];
	for (const id of recentIds) {
		const task = await getTask(id);
		if (!task || taskVisibleTo(task, scope)) toClear.push(id);
	}
	if (toClear.length === 0) return;

	await Promise.all(
		toClear.flatMap((id) => [redis.del(TASK_KEY(id)), redis.del(SEEN_KEY(id))]),
	);
	await redis.srem(RECENT_TASKS_KEY, ...toClear);
	publishUpdate({
		id: "clear",
		type: "",
		serverId: scope.serverId,
		label: "",
		status: "completed",
		totalJobs: 0,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: 0,
		sealed: true,
	});
}

// ── Per-scan auto-enrich task ─────────────────────────────────────────────────
// A library scan owns one enrich task: file-event workers attribute the Amazon
// enrichment they spawn to it. Keyed by the scan task id, so concurrent scans
// (even of the same server) never share or seal each other's enrichment.

const SCAN_ENRICH_KEY = (scanTaskId: string) => `scan:${scanTaskId}:enrich`;

/**
 * Get (or lazily create) the enrich task for a scan. Concurrent file-event
 * workers of the same scan converge on one task via SET NX.
 */
export async function getOrCreateScanEnrichTask(
	scanTaskId: string,
	serverId: string,
): Promise<string> {
	const key = SCAN_ENRICH_KEY(scanTaskId);
	const existing = await redis.get(key);
	if (existing) return existing;

	const candidate = await createTask({
		type: "metadata-enrich-auto",
		serverId,
	});
	const won = await redis.set(key, candidate.id, "EX", SEEN_TTL, "NX");
	if (won === "OK") return candidate.id;

	// Lost the race against another worker of the same scan — discard ours.
	const winner = await redis.get(key);
	await deleteTask(candidate.id);
	return winner ?? candidate.id;
}

export async function isTaskCancelled(taskId: string): Promise<boolean> {
	const status = await redis.hget(TASK_KEY(taskId), "status");
	return status === "cancelled";
}

// ── Finish (terminal transition) ──────────────────────────────────────────────

async function finishTask(
	taskId: string,
	status: "completed" | "cancelled",
): Promise<void> {
	const key = TASK_KEY(taskId);
	// Only running tasks transition: finish can race in from several places
	// (counter catch-up, finalize, cancel, reconcile).
	const previous = await redis.hget(key, "status");
	if (previous !== "running") return;

	await redis.hset(key, "status", status);
	await redis.srem(ACTIVE_TASKS_KEY, taskId);
	await redis.sadd(RECENT_TASKS_KEY, taskId);
	await redis.expire(key, DONE_TTL);
	await redis.expire(SEEN_KEY(taskId), DONE_TTL);
	const task = await getTask(taskId);
	if (task) flushPublish(task);

	// A finished scan (completed or cancelled) stops feeding its enrich task;
	// seal it so it finishes once its already-queued enrich jobs drain.
	if (task?.type === "library-scan") {
		const enrichKey = SCAN_ENRICH_KEY(taskId);
		const enrichId = await redis.get(enrichKey);
		if (enrichId) {
			await redis.del(enrichKey);
			await finalizeTask(enrichId).catch((err) =>
				log.error({ err, enrichId }, "Failed to finalize scan enrich task"),
			);
		}
	}
}

function parseTask(data: Record<string, string>): Task {
	return {
		id: data.id ?? "",
		type: data.type ?? "",
		serverId: data.serverId || null,
		label: data.label ?? "",
		status: (data.status as Task["status"]) ?? "running",
		totalJobs: Number(data.totalJobs ?? 0),
		completedJobs: Number(data.completedJobs ?? 0),
		failedJobs: Number(data.failedJobs ?? 0),
		createdAt: Number(data.createdAt ?? 0),
		sealed: data.sealed === "1",
	};
}
