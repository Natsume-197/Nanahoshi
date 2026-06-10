import { Redis } from "ioredis";
import { fileEventQueue } from "../infrastructure/queue/queues/file-event.queue";
import { redis } from "../infrastructure/queue/redis";

const TASK_CHANNEL = "task:updates";

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
}

const TASK_KEY = (id: string) => `task:${id}`;
const ACTIVE_TASKS_KEY = "active_tasks";
const RECENT_TASKS_KEY = "recent_tasks";
const DONE_TTL = 3600; // 1 hour

export async function createTask(opts: {
	type: string;
	label: string;
	totalJobs?: number;
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
		.exec();

	if (!results) return;
	const completedVal = results[0]?.[1] as number;
	const failedVal = Number(results[1]?.[1] ?? 0);
	const totalVal = Number(results[2]?.[1] ?? 0);

	if (totalVal > 0 && completedVal + failedVal >= totalVal) {
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
		.exec();

	if (!results) return;
	const failedVal = results[0]?.[1] as number;
	const completedVal = Number(results[1]?.[1] ?? 0);
	const totalVal = Number(results[2]?.[1] ?? 0);

	if (totalVal > 0 && completedVal + failedVal >= totalVal) {
		await finishTask(taskId, "completed");
	} else if ((completedVal + failedVal) % 10 === 0) {
		const task = await getTask(taskId);
		if (task) publishUpdate(task);
	}
}

export async function cancelTask(taskId: string): Promise<void> {
	await finishTask(taskId, "cancelled");

	// Remove waiting jobs from the queue that belong to this task
	removeWaitingJobs(taskId).catch((err) =>
		console.error(
			`[TaskManager] Failed to remove waiting jobs for ${taskId}:`,
			err,
		),
	);
}

async function removeWaitingJobs(taskId: string): Promise<void> {
	const waitingJobs = await fileEventQueue.getJobs(["waiting", "delayed"]);
	let removed = 0;
	for (const job of waitingJobs) {
		if (job.data?.taskId === taskId) {
			await job.remove().catch(() => {});
			removed++;
		}
	}
	if (removed > 0) {
		console.log(
			`[TaskManager] Removed ${removed} waiting jobs for task ${taskId}`,
		);
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
	});
}

const AUTO_ENRICH_TASK_KEY = "auto_enrich_task_id";

/**
 * Get or create a shared task for auto metadata enrichment (from scan).
 * If there's already an active auto-enrich task, reuse it; otherwise create a new one.
 */
export async function getOrCreateAutoEnrichTask(): Promise<string> {
	const existingId = await redis.get(AUTO_ENRICH_TASK_KEY);
	if (existingId) {
		const task = await getTask(existingId);
		if (task && task.status === "running") {
			return existingId;
		}
	}

	const task = await createTask({
		type: "metadata-enrich-auto",
		label: "Auto enrich metadata (Amazon)",
	});
	await redis.set(AUTO_ENRICH_TASK_KEY, task.id);
	return task.id;
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
	await redis.hset(key, "status", status);
	await redis.srem(ACTIVE_TASKS_KEY, taskId);
	await redis.sadd(RECENT_TASKS_KEY, taskId);
	await redis.expire(key, DONE_TTL);
	const task = await getTask(taskId);
	if (task) publishUpdate(task);
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
	};
}
