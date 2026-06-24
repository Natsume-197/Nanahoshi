import type { Queue } from "bullmq";
import { Redis } from "ioredis";
import { bookIndexQueue } from "../infrastructure/queue/queues/book-index.queue";
import { fileEventQueue } from "../infrastructure/queue/queues/file-event.queue";
import { metadataEnrichQueue } from "../infrastructure/queue/queues/metadata-enrich.queue";
import { ranobedbImportQueue } from "../infrastructure/queue/queues/ranobedb-import.queue";
import { sendToKindleQueue } from "../infrastructure/queue/queues/send-to-kindle.queue";
import { redis } from "../infrastructure/queue/redis";
import { logger } from "../lib/logger";

const log = logger.child({ component: "task-manager" });

const TASK_CHANNEL = "task:updates";

export const LIBRARY_SCAN_TASK_TYPE = "library-scan";
const AUTO_ENRICH_TASK_TYPE = "metadata-enrich-auto";

// Queues whose pending jobs can be removed when a task is cancelled, keyed by
// the `queue` name passed to createTask.
const QUEUES_BY_NAME: Record<string, Queue> = {
	"file-events": fileEventQueue,
	"metadata-enrich": metadataEnrichQueue,
	"book-index": bookIndexQueue,
	"send-to-kindle": sendToKindleQueue,
	"ranobedb-import": ranobedbImportQueue,
};

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

export interface Task {
	id: string;
	type: string;
	label: string;
	status: "running" | "completed" | "cancelled";
	totalJobs: number;
	completedJobs: number;
	failedJobs: number;
	createdAt: number;
	/**
	 * A sealed task has every job enqueued (totalJobs is final), so it finishes
	 * as soon as the counters catch up. Tasks whose producer keeps adding jobs
	 * stay unsealed until finalizeTask — counters alone can never finish them,
	 * because they transiently catch up with a still-growing total.
	 */
	sealed: boolean;
}

const TASK_KEY = (id: string) => `task:${id}`;
const ACTIVE_TASKS_KEY = "active_tasks";
const RECENT_TASKS_KEY = "recent_tasks";
const DONE_TTL = 3600; // 1 hour

export async function createTask(opts: {
	type: string;
	label: string;
	totalJobs?: number;
	/** Pass sealed: true when every job is enqueued right after creation. */
	sealed?: boolean;
	/** Name of the queue holding this task's jobs (see QUEUES_BY_NAME). */
	queue?: string;
}): Promise<Task> {
	const id = crypto.randomUUID();
	const task: Task = {
		id,
		type: opts.type,
		label: opts.label,
		status: "running",
		totalJobs: opts.totalJobs ?? 0,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: Date.now(),
		sealed: opts.sealed ?? false,
	};

	await redis.hset(TASK_KEY(id), {
		id: task.id,
		type: task.type,
		label: task.label,
		status: task.status,
		totalJobs: String(task.totalJobs),
		completedJobs: "0",
		failedJobs: "0",
		createdAt: String(task.createdAt),
		sealed: task.sealed ? "1" : "0",
		queue: opts.queue ?? "",
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

export async function getActiveTasks(): Promise<Task[]> {
	const ids = await redis.smembers(ACTIVE_TASKS_KEY);
	if (ids.length === 0) return [];

	const tasks: Task[] = [];
	for (const id of ids) {
		const task = await getTask(id);
		if (task) tasks.push(task);
	}
	return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllTasks(): Promise<Task[]> {
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
			tasks.push(task);
		} else {
			expiredIds.push(id);
		}
	}

	// Clean up expired IDs from sets
	if (expiredIds.length > 0) {
		await Promise.all([
			redis.srem(ACTIVE_TASKS_KEY, ...expiredIds),
			redis.srem(RECENT_TASKS_KEY, ...expiredIds),
		]);
	}

	return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function incrementTotalJobs(
	taskId: string,
	count: number,
): Promise<void> {
	await redis.hincrby(TASK_KEY(taskId), "totalJobs", count);
	const task = await getTask(taskId);
	if (task) publishUpdate(task);
}

export async function incrementCompleted(taskId: string): Promise<void> {
	const key = TASK_KEY(taskId);
	const results = await redis
		.multi()
		.hincrby(key, "completedJobs", 1)
		.hget(key, "failedJobs")
		.hget(key, "totalJobs")
		.hget(key, "sealed")
		.exec();

	if (!results) return;
	const completedVal = results[0]?.[1] as number;
	const failedVal = Number(results[1]?.[1] ?? 0);
	const totalVal = Number(results[2]?.[1] ?? 0);
	const sealed = results[3]?.[1] === "1";

	if (sealed && completedVal + failedVal >= totalVal) {
		await finishTask(taskId, "completed");
	} else if ((completedVal + failedVal) % 10 === 0) {
		const task = await getTask(taskId);
		if (task) publishUpdate(task);
	}
}

export async function incrementFailed(taskId: string): Promise<void> {
	const key = TASK_KEY(taskId);
	const results = await redis
		.multi()
		.hincrby(key, "failedJobs", 1)
		.hget(key, "completedJobs")
		.hget(key, "totalJobs")
		.hget(key, "sealed")
		.exec();

	if (!results) return;
	const failedVal = results[0]?.[1] as number;
	const completedVal = Number(results[1]?.[1] ?? 0);
	const totalVal = Number(results[2]?.[1] ?? 0);
	const sealed = results[3]?.[1] === "1";

	if (sealed && completedVal + failedVal >= totalVal) {
		await finishTask(taskId, "completed");
	} else if ((completedVal + failedVal) % 10 === 0) {
		const task = await getTask(taskId);
		if (task) publishUpdate(task);
	}
}

/**
 * Seal a task: its producer is done enqueueing, totalJobs is final. Finishes
 * the task immediately if the counters have already caught up (including the
 * zero-jobs case).
 */
export async function finalizeTask(taskId: string): Promise<void> {
	const key = TASK_KEY(taskId);
	const status = await redis.hget(key, "status");
	if (status !== "running") return;

	await redis.hset(key, "sealed", "1");

	const task = await getTask(taskId);
	if (task?.status !== "running") return;
	if (task.completedJobs + task.failedJobs >= task.totalJobs) {
		await finishTask(taskId, "completed");
	} else {
		publishUpdate(task);
	}
}

export async function cancelTask(taskId: string): Promise<void> {
	await finishTask(taskId, "cancelled");

	// Remove pending jobs from the task's queue
	removeWaitingJobs(taskId).catch((err) =>
		log.error({ err, taskId }, "Failed to remove waiting jobs"),
	);
}

async function removeWaitingJobs(taskId: string): Promise<void> {
	const queueName = await redis.hget(TASK_KEY(taskId), "queue");
	const queue = (queueName && QUEUES_BY_NAME[queueName]) || fileEventQueue;
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
	const key = TASK_KEY(taskId);
	await redis.del(key);
	await redis.srem(ACTIVE_TASKS_KEY, taskId);
	await redis.srem(RECENT_TASKS_KEY, taskId);
	publishUpdate({
		id: taskId,
		type: "",
		label: "",
		status: "completed",
		totalJobs: 0,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: 0,
		sealed: true,
	});
}

export async function clearFinishedTasks(): Promise<void> {
	const recentIds = await redis.smembers(RECENT_TASKS_KEY);
	if (recentIds.length === 0) return;
	await Promise.all(recentIds.map((id) => redis.del(TASK_KEY(id))));
	await redis.del(RECENT_TASKS_KEY);
	publishUpdate({
		id: "clear",
		type: "",
		label: "",
		status: "completed",
		totalJobs: 0,
		completedJobs: 0,
		failedJobs: 0,
		createdAt: 0,
		sealed: true,
	});
}

const AUTO_ENRICH_TASK_KEY = "auto_enrich_task_id";

// Atomically adopts the running shared task, unsealing it because a new
// producer is active again. Returns nil when there is no running task.
const AUTO_ENRICH_ADOPT_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if cur then
	local status = redis.call('HGET', 'task:' .. cur, 'status')
	if status == 'running' then
		redis.call('HSET', 'task:' .. cur, 'sealed', '0')
		return cur
	end
end
return false
`;

// Same adoption logic, but installs the candidate id when no running task
// exists — so concurrent file-event workers converge on a single task.
const AUTO_ENRICH_CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if cur then
	local status = redis.call('HGET', 'task:' .. cur, 'status')
	if status == 'running' then
		redis.call('HSET', 'task:' .. cur, 'sealed', '0')
		return cur
	end
end
redis.call('SET', KEYS[1], ARGV[1])
return ARGV[1]
`;

/**
 * Get or create the shared task for auto metadata enrichment (from scan).
 * Concurrent callers always converge on a single running task.
 */
export async function getOrCreateAutoEnrichTask(): Promise<string> {
	const adopted = (await redis.eval(
		AUTO_ENRICH_ADOPT_SCRIPT,
		1,
		AUTO_ENRICH_TASK_KEY,
	)) as string | null;
	if (adopted) return adopted;

	const candidate = await createTask({
		type: AUTO_ENRICH_TASK_TYPE,
		label: "Auto enrich metadata (Amazon)",
		queue: "metadata-enrich",
	});

	const winnerId = (await redis.eval(
		AUTO_ENRICH_CAS_SCRIPT,
		1,
		AUTO_ENRICH_TASK_KEY,
		candidate.id,
	)) as string;

	if (winnerId !== candidate.id) {
		// Lost the race against another worker — discard our candidate
		await deleteTask(candidate.id);
	}
	return winnerId;
}

/**
 * Seal the shared auto-enrich task once no library scan can feed it anymore.
 * Called when a scan task finishes and, as a backstop, when the
 * metadata-enrich queue drains.
 */
export async function maybeFinalizeAutoEnrichTask(): Promise<void> {
	const id = await redis.get(AUTO_ENRICH_TASK_KEY);
	if (!id) return;
	const task = await getTask(id);
	if (task?.status !== "running") return;

	const scanning = (await getActiveTasks()).some(
		(t) => t.type === LIBRARY_SCAN_TASK_TYPE && t.status === "running",
	);
	if (scanning) return;

	await finalizeTask(id);
}

export async function isTaskCancelled(taskId: string): Promise<boolean> {
	const status = await redis.hget(TASK_KEY(taskId), "status");
	return status === "cancelled";
}

async function finishTask(
	taskId: string,
	status: "completed" | "cancelled",
): Promise<void> {
	const key = TASK_KEY(taskId);
	// Only running tasks transition: finish can race in from several places
	// (counter catch-up, finalize, cancel).
	const previous = await redis.hget(key, "status");
	if (previous !== "running") return;

	await redis.hset(key, "status", status);
	await redis.srem(ACTIVE_TASKS_KEY, taskId);
	await redis.sadd(RECENT_TASKS_KEY, taskId);
	await redis.expire(key, DONE_TTL);
	const task = await getTask(taskId);
	if (task) publishUpdate(task);

	// A finished scan (completed or cancelled) stops feeding the shared
	// auto-enrich task; seal it unless another scan is still running.
	if (task?.type === LIBRARY_SCAN_TASK_TYPE) {
		await maybeFinalizeAutoEnrichTask();
	}
}

function parseTask(data: Record<string, string>): Task {
	return {
		id: data.id ?? "",
		type: data.type ?? "",
		label: data.label ?? "",
		status: (data.status as Task["status"]) ?? "running",
		totalJobs: Number(data.totalJobs ?? 0),
		completedJobs: Number(data.completedJobs ?? 0),
		failedJobs: Number(data.failedJobs ?? 0),
		createdAt: Number(data.createdAt ?? 0),
		sealed: data.sealed === "1",
	};
}
