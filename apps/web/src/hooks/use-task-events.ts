import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
// Pure data module (no server-only imports), safe to pull into the web bundle.
import { CONTENT_TASK_TYPES } from "@nanahoshi-v2/api/modules/tasks/task-registry";
import { env } from "@nanahoshi-v2/env/web";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { orpc, queryClient } from "@/utils/orpc";

const activeTasksKey = orpc.tasks.getActiveTasks.queryOptions().queryKey;
const allTasksKey = orpc.tasks.getAllTasks.queryOptions().queryKey;

const CONTENT_REFRESH_THROTTLE_MS = 4000;

// JSON prefix of the listRandom key, to exclude it from periodic refreshes
const listRandomKeyPrefix = JSON.stringify(orpc.books.listRandom.key()).slice(
	0,
	-1,
);

let lastContentRefresh = 0;

/**
 * Refetch content while a scan/enrich task is running so books appear as
 * they're added, without waiting for a page reload. Throttled; "You might
 * like" (listRandom) is only refreshed at the end so it doesn't reshuffle
 * on every tick.
 */
function refreshContentForTask(task: Task) {
	if (!CONTENT_TASK_TYPES.has(task.type)) return;

	if (task.status !== "running") {
		lastContentRefresh = Date.now();
		queryClient.invalidateQueries();
		return;
	}

	const now = Date.now();
	if (now - lastContentRefresh < CONTENT_REFRESH_THROTTLE_MS) return;
	lastContentRefresh = now;
	queryClient.invalidateQueries({
		predicate: (query) =>
			!JSON.stringify(query.queryKey).startsWith(listRandomKeyPrefix),
	});
}

function updateTaskInCache(task: Task) {
	// Update getActiveTasks cache
	queryClient.setQueriesData<Task[]>({ queryKey: activeTasksKey }, (old) => {
		if (!old) return old;
		if (task.status !== "running") {
			return old.filter((t) => t.id !== task.id);
		}
		const idx = old.findIndex((t) => t.id === task.id);
		if (idx >= 0) {
			const updated = [...old];
			updated[idx] = task;
			return updated;
		}
		return [task, ...old];
	});

	// Update getAllTasks cache
	queryClient.setQueriesData<Task[]>({ queryKey: allTasksKey }, (old) => {
		if (!old) return old;
		// deleted or cleared
		if (task.createdAt === 0) {
			if (task.id === "clear") {
				return old.filter((t) => t.status === "running");
			}
			return old.filter((t) => t.id !== task.id);
		}
		const idx = old.findIndex((t) => t.id === task.id);
		if (idx >= 0) {
			const updated = [...old];
			updated[idx] = task;
			return updated;
		}
		return [task, ...old];
	});
}

export function useTaskEvents() {
	useMountEffect(() => {
		const url = `${env.VITE_SERVER_URL}/api/tasks/events`;
		const eventSource = new EventSource(url, { withCredentials: true });

		eventSource.onopen = () => {
			queryClient.invalidateQueries({ queryKey: activeTasksKey });
			queryClient.invalidateQueries({ queryKey: allTasksKey });
		};

		eventSource.onerror = () => {
			// Browser handles reconnection automatically
		};

		eventSource.onmessage = (event) => {
			try {
				const task = JSON.parse(event.data) as Task;
				updateTaskInCache(task);
				refreshContentForTask(task);
			} catch {
				// ignore parse errors
			}
		};

		return () => {
			eventSource.close();
		};
	});
}
