import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
// Pure data module (no server-only imports), safe to pull into the web bundle.
import { CONTENT_TASK_TYPES } from "@nanahoshi-v2/api/modules/tasks/task-registry";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { orpc, queryClient } from "@/utils/orpc";

const activeTasksKey = orpc.tasks.getActiveTasks.queryOptions().queryKey;
const allTasksKey = orpc.tasks.getAllTasks.queryOptions().queryKey;

const CONTENT_REFRESH_THROTTLE_MS = 4000;

// While a task runs, only "recently added" refreshes live; everything else
// (series, random rows, library lists) waits for the final full invalidation
// so the page doesn't churn on every progress tick.
const liveRefreshKeys = [
	orpc.books.listRecent.key(),
	orpc.audiobooks.listRecent.key(),
];

// Rebuild tasks don't touch book records (modifiesContent: false), so they're
// absent from CONTENT_TASK_TYPES. Refresh the recommendation rows on their own
// so a manual rebuild shows up without a page reload.
const RECOMMENDATION_TASK_TYPES: ReadonlySet<string> = new Set([
	"recommendations-rebuild",
	"recommendations-rebuild-global",
]);

let lastContentRefresh = 0;

/**
 * While a scan/enrich task is running, refetch only the recently-added rows
 * (throttled) so new books show up without hammering every query on each
 * progress tick. Everything else refreshes once, when the task ends.
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
	for (const queryKey of liveRefreshKeys) {
		queryClient.invalidateQueries({ queryKey });
	}
}

function refreshRecommendationsForTask(task: Task) {
	if (!RECOMMENDATION_TASK_TYPES.has(task.type)) return;
	if (task.status === "running") return;
	queryClient.invalidateQueries({ queryKey: orpc.recommendations.key() });
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
		// Tombstone: the task was deleted/cleared server-side.
		if (task.createdAt === 0) {
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
	// Task progress rides the shared gateway WebSocket. On every (re)connect we
	// refetch the task lists so a stale view re-syncs after a dropped connection.
	useGatewayChannel(
		"tasks",
		(data) => {
			const task = data as Task;
			updateTaskInCache(task);
			refreshContentForTask(task);
			refreshRecommendationsForTask(task);
		},
		() => {
			queryClient.invalidateQueries({ queryKey: activeTasksKey });
			queryClient.invalidateQueries({ queryKey: allTasksKey });
		},
	);
}
