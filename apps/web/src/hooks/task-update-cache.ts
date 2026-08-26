import type { Task } from "@nanahoshi-v2/api/modules/taskManager";

export const MAX_VISIBLE_ACTIVE_TASKS = 20;

function latestUpdates(updates: readonly Task[]): Map<string, Task> {
	const latest = new Map<string, Task>();
	for (const task of updates) latest.set(task.id, task);
	return latest;
}

/** Apply a gateway burst without scanning and copying the cache once per event. */
export function mergeActiveTaskUpdates(
	old: readonly Task[],
	updates: readonly Task[],
): Task[] {
	const pending = latestUpdates(updates);
	const existingIds = new Set(old.map((task) => task.id));
	const added = [...pending.values()]
		.filter((task) => task.status === "running" && !existingIds.has(task.id))
		.reverse();
	const existing: Task[] = [];

	for (const task of old) {
		const update = pending.get(task.id);
		if (!update) {
			existing.push(task);
			continue;
		}
		pending.delete(task.id);
		if (update.status === "running") existing.push(update);
	}

	return [...added, ...existing];
}

export function mergeAllTaskUpdates(
	old: readonly Task[],
	updates: readonly Task[],
): Task[] {
	const pending = latestUpdates(updates);
	const existingIds = new Set(old.map((task) => task.id));
	const added = [...pending.values()]
		.filter((task) => task.createdAt !== 0 && !existingIds.has(task.id))
		.reverse();
	const existing: Task[] = [];

	for (const task of old) {
		const update = pending.get(task.id);
		if (!update) {
			existing.push(task);
			continue;
		}
		pending.delete(task.id);
		if (update.createdAt !== 0) existing.push(update);
	}

	return [...added, ...existing];
}

export function selectVisibleActiveTasks(tasks: readonly Task[], page = 0) {
	const pageCount = Math.max(
		1,
		Math.ceil(tasks.length / MAX_VISIBLE_ACTIVE_TASKS),
	);
	const currentPage = Math.min(Math.max(0, page), pageCount - 1);
	const start = currentPage * MAX_VISIBLE_ACTIVE_TASKS;
	const visible = tasks.slice(start, start + MAX_VISIBLE_ACTIVE_TASKS);
	return {
		visible,
		currentPage,
		pageCount,
		from: visible.length > 0 ? start + 1 : 0,
		to: start + visible.length,
		total: tasks.length,
	};
}

export function createTaskUpdateBatcher(
	flush: (tasks: Task[]) => void,
	delayMs: number,
) {
	const pending = new Map<string, Task>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const flushNow = () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
		if (pending.size === 0) return;
		const tasks = [...pending.values()];
		pending.clear();
		flush(tasks);
	};

	return {
		push(task: Task) {
			pending.set(task.id, task);
			timer ??= setTimeout(flushNow, delayMs);
		},
		flushNow,
	};
}
