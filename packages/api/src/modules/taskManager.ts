import type { Queue } from "bullmq";
import {
	addToBucket,
	lazySubscriber,
	removeFromBucket,
} from "../infrastructure/queue/pubsub";
import { bookIndexQueue } from "../infrastructure/queue/queues/book-index.queue";
import { coverColorQueue } from "../infrastructure/queue/queues/cover-color.queue";
import { fileEventQueue } from "../infrastructure/queue/queues/file-event.queue";
import { metadataEnrichQueue } from "../infrastructure/queue/queues/metadata-enrich.queue";
import { ranobedbImportQueue } from "../infrastructure/queue/queues/ranobedb-import.queue";
import { sendToKindleQueue } from "../infrastructure/queue/queues/send-to-kindle.queue";
import { redis } from "../infrastructure/queue/redis";
import { logger } from "../lib/logger";
import * as notificationService from "../routers/notifications/notification.service";
import {
	type QueueName,
	TASK_REGISTRY,
	type TaskType,
} from "./tasks/task-registry";

const log = logger.child({ component: "task-manager" });

const TASK_CHANNEL = "task:updates";

// The concrete BullMQ queue behind each registry queue name. Lives here (not in
// the registry) so the registry stays free of server-only imports. Resolved at
// call time (not a module-level record) so tests can mock the queue modules.
function queueForName(name: QueueName): Queue {
	switch (name) {
		case "file-events":
			return fileEventQueue;
		case "metadata-enrich":
			return metadataEnrichQueue;
		case "book-index":
			return bookIndexQueue;
		case "send-to-kindle":
			return sendToKindleQueue;
		case "ranobedb-import":
			return ranobedbImportQueue;
		case "cover-color":
			return coverColorQueue;
	}
}

function queueForTask(task: Task): Queue | undefined {
	const def = TASK_REGISTRY[task.type as TaskType];
	return def ? queueForName(def.queue) : undefined;
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
	/** Initiating user; `null` for scheduled/system tasks. Drives finish notifications. */
	userId: string | null;
	/** Target library for scan/upload tasks — resolves the notification audience. */
	libraryId: number | null;
}

/** Who is asking for tasks — drives visibility filtering. */
export interface TaskScope {
	serverId: string | null;
	isAppOwner: boolean;
	/** Org owner or administrator of `serverId` — sees every server task. */
	isServerAdmin: boolean;
	userId: string | null;
}

// Server admins (and app owners) see everything in their server; a regular
// member only sees tasks they initiated (e.g. their own send-to-kindle).
export function taskVisibleTo(task: Task, scope: TaskScope): boolean {
	if (task.serverId === null) return scope.isAppOwner;
	if (task.serverId !== scope.serverId) return false;
	if (scope.isAppOwner || scope.isServerAdmin) return true;
	return task.userId !== null && task.userId === scope.userId;
}

const TASK_KEY = (id: string) => `task:${id}`;
// Per-task set of job keys already counted, making increments idempotent so a
// redelivered queue event (or a worker restart) can never double-count.
const SEEN_KEY = (id: string) => `task:${id}:seen`;
const ACTIVE_TASKS_KEY = "active_tasks";
const RECENT_TASKS_KEY = "recent_tasks";
const DONE_TTL = 3600; // 1 hour
const SEEN_TTL = 86400; // 24h safety net for abandoned tasks

// ── Pub/sub (one shared subscriber, scope-routed in-process) ─────────────────

// Mirrors taskVisibleTo as an interest index so a task event wakes only the
// connections that can see it, not every connection: server tasks route by
// serverId, global (null-serverId) tasks route to app owners. One shared Redis
// subscriber for the whole process (not one per caller — every gateway
// connection subscribes, so per-caller connections would explode).
type TaskCallback = (task: Task) => void;
const serverInterest = new Map<string, Set<TaskCallback>>();
const appOwnerInterest = new Set<TaskCallback>();

function routeTask(task: Task): void {
	const bucket =
		task.serverId === null
			? appOwnerInterest
			: serverInterest.get(task.serverId);
	if (bucket) for (const cb of bucket) cb(task);
}

const ensureTaskSubscriber = lazySubscriber(
	[TASK_CHANNEL],
	(_channel, message) => {
		try {
			routeTask(JSON.parse(message) as Task);
		} catch {}
	},
);

function publishUpdate(task: Task): void {
	redis.publish(TASK_CHANNEL, JSON.stringify(task)).catch(() => {});
}

// Subscribe a connection to the tasks it may see. Buckets stay coarse (by
// serverId / app owner); the per-connection wrapper applies the fine-grained
// taskVisibleTo filter so a regular member only receives their own tasks.
export function subscribeToTasks(
	scope: TaskScope,
	onMessage: TaskCallback,
): () => void {
	ensureTaskSubscriber();
	const filtered: TaskCallback = (task) => {
		if (taskVisibleTo(task, scope)) onMessage(task);
	};
	if (scope.serverId !== null) {
		addToBucket(serverInterest, scope.serverId, filtered);
	}
	if (scope.isAppOwner) appOwnerInterest.add(filtered);
	return () => {
		if (scope.serverId !== null) {
			removeFromBucket(serverInterest, scope.serverId, filtered);
		}
		appOwnerInterest.delete(filtered);
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
	/** Initiating user — recipient of personal finish notifications. */
	userId?: string | null;
	/** Target library for scan/upload — audience of library finish notifications. */
	libraryId?: number | null;
	/** Owning task (e.g. the scan behind an auto-enrich); lets reconcile seal orphans. */
	parentTaskId?: string | null;
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
		userId: opts.userId ?? null,
		libraryId: opts.libraryId ?? null,
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
		userId: task.userId ?? "",
		libraryId: task.libraryId === null ? "" : String(task.libraryId),
		parentTaskId: opts.parentTaskId ?? "",
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

// Reserve `count` jobs right before enqueuing them; reserving ahead keeps an
// unsealed task from transiently looking done mid-production.
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

// Backstop for a lost increment event: finish a sealed task whose outstanding
// hit zero, or whose queue has no live jobs left for it. Unsealed tasks with a
// terminal (or deleted) parent get sealed here — their parent's finish cleanup
// already ran, so nothing else ever will.
export async function reconcileTask(taskId: string): Promise<void> {
	const task = await getTask(taskId);
	if (task?.status !== "running") return;

	if (!task.sealed) {
		const parentId = await redis.hget(TASK_KEY(taskId), "parentTaskId");
		if (!parentId) return;
		if (await isTaskRunning(parentId)) return;
		log.warn(
			{ taskId, parentId },
			"Sealing orphaned task whose parent already finished",
		);
		await finalizeTask(taskId);
		return;
	}

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

// Tombstone (createdAt 0) telling clients to drop a task. Carries the task's
// serverId/userId so it reaches exactly the connections that saw the task.
function publishTombstone(
	taskId: string,
	existing: Task | null | undefined,
): void {
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
		userId: existing?.userId ?? null,
		libraryId: null,
	});
}

export async function deleteTask(taskId: string): Promise<void> {
	// Read the task before deleting so the tombstone routes to the right clients.
	const existing = await getTask(taskId);
	await redis.del(TASK_KEY(taskId), SEEN_KEY(taskId));
	await redis.srem(ACTIVE_TASKS_KEY, taskId);
	await redis.srem(RECENT_TASKS_KEY, taskId);
	publishTombstone(taskId, existing);
}

export async function clearFinishedTasks(scope: TaskScope): Promise<void> {
	const recentIds = await redis.smembers(RECENT_TASKS_KEY);
	if (recentIds.length === 0) return;

	// Only clear the finished tasks this caller can see; leave the rest be.
	const toClear: { id: string; task: Task | null }[] = [];
	for (const id of recentIds) {
		const task = await getTask(id);
		if (!task || taskVisibleTo(task, scope)) toClear.push({ id, task });
	}
	if (toClear.length === 0) return;

	await Promise.all(
		toClear.flatMap(({ id }) => [
			redis.del(TASK_KEY(id)),
			redis.del(SEEN_KEY(id)),
		]),
	);
	await redis.srem(RECENT_TASKS_KEY, ...toClear.map(({ id }) => id));
	// One tombstone per task (not a server-wide "clear"): with per-user
	// visibility, each removal must route only to whoever could see that task.
	for (const { id, task } of toClear) publishTombstone(id, task);
}

// ── Per-scan auto-enrich task ─────────────────────────────────────────────────
// A scan owns one enrich task (file-event workers attribute their provider
// enrichment to it). Keyed by scan id, so concurrent scans stay separate.

const SCAN_ENRICH_KEY = (scanTaskId: string) => `scan:${scanTaskId}:enrich`;

// Get (or lazily create) the enrich task for a scan. Concurrent file-event
// workers of the same scan converge on one task via SET NX. Returns null when
// the scan is no longer running — nothing would ever seal a task created then.
export async function getOrCreateScanEnrichTask(
	scanTaskId: string,
	serverId: string,
): Promise<string | null> {
	const key = SCAN_ENRICH_KEY(scanTaskId);
	const existing = await redis.get(key);
	if (existing) return existing;

	// A finished/cancelled scan already ran its enrich cleanup; in-flight scan
	// jobs landing here afterwards must not resurrect the task.
	const parent = await getTask(scanTaskId);
	if (parent?.status !== "running") return null;

	// Inherit the scan's initiator/library so the finish notification reaches
	// whoever started the scan (scheduled scans have neither → stays silent).
	const candidate = await createTask({
		type: "metadata-enrich-auto",
		serverId,
		userId: parent.userId,
		libraryId: parent.libraryId,
		parentTaskId: scanTaskId,
	});
	const won = await redis.set(key, candidate.id, "EX", SEEN_TTL, "NX");
	if (won === "OK") {
		// The scan may have finished between the status check and the SET, with
		// its cleanup running before the key existed — undo instead of orphaning.
		if (await isTaskRunning(scanTaskId)) return candidate.id;
		await redis.del(key);
		await deleteTask(candidate.id);
		return null;
	}

	// Lost the race against another worker of the same scan — discard ours.
	const winner = await redis.get(key);
	await deleteTask(candidate.id);
	return winner;
}

export async function isTaskCancelled(taskId: string): Promise<boolean> {
	const status = await redis.hget(TASK_KEY(taskId), "status");
	// A deleted/expired task must not resurrect work: treat missing as cancelled.
	return status === "cancelled" || status === null;
}

/** Thrown by producer checkpoints; callers treat it as a clean stop, not a failure. */
export class TaskCancelledError extends Error {
	constructor(taskId: string) {
		super(`Task ${taskId} was cancelled`);
		this.name = "TaskCancelledError";
	}
}

/**
 * Producer-side cancellation checkpoint: long-running producers (scan phases,
 * bulk job enqueuers) call this between batches so cancelling a task stops the
 * heavy work early instead of only skipping its jobs one by one.
 */
export async function throwIfTaskCancelled(taskId?: string): Promise<void> {
	if (taskId && (await isTaskCancelled(taskId))) {
		throw new TaskCancelledError(taskId);
	}
}

async function isTaskRunning(taskId: string): Promise<boolean> {
	return (await redis.hget(TASK_KEY(taskId), "status")) === "running";
}

// ── Finish (terminal transition) ──────────────────────────────────────────────

// Only running tasks transition: finish can race in from several places
// (counter catch-up, finalize, cancel, reconcile). CAS so exactly one racer
// wins — the finish notification must fire once.
const FINISH_SCRIPT = `
if redis.call('HGET', KEYS[1], 'status') ~= 'running' then return 0 end
redis.call('HSET', KEYS[1], 'status', ARGV[1])
return 1
`;

async function finishTask(
	taskId: string,
	status: "completed" | "cancelled",
): Promise<void> {
	const key = TASK_KEY(taskId);
	const transitioned = (await redis.eval(
		FINISH_SCRIPT,
		1,
		key,
		status,
	)) as number;
	if (transitioned !== 1) return;

	await redis.srem(ACTIVE_TASKS_KEY, taskId);
	await redis.sadd(RECENT_TASKS_KEY, taskId);
	await redis.expire(key, DONE_TTL);
	await redis.expire(SEEN_KEY(taskId), DONE_TTL);
	const task = await getTask(taskId);
	if (task) flushPublish(task);

	// Cancelled tasks don't notify — the canceller is the initiator.
	if (
		task &&
		status === "completed" &&
		TASK_REGISTRY[task.type as TaskType]?.notifyOnFinish
	) {
		notificationService
			.emitTaskFinished(task)
			.catch((err) => log.error({ err, taskId }, "task finish notify failed"));
	}

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
		userId: data.userId || null,
		libraryId: data.libraryId ? Number(data.libraryId) : null,
	};
}
