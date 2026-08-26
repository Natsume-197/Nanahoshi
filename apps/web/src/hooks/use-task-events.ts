import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
// Pure data module (no server-only imports), safe to pull into the web bundle.
import { CONTENT_TASK_TYPES } from "@nanahoshi-v2/api/modules/tasks/task-registry";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { orpc, queryClient } from "@/utils/orpc";
import {
	createTaskUpdateBatcher,
	mergeActiveTaskUpdates,
	mergeAllTaskUpdates,
} from "./task-update-cache";

const activeTasksKey = orpc.tasks.getActiveTasks.queryOptions().queryKey;
const allTasksKey = orpc.tasks.getAllTasks.queryOptions().queryKey;

const CONTENT_REFRESH_THROTTLE_MS = 4000;
const TASK_UPDATE_BATCH_MS = 100;

// While a task runs, only "recently added" refreshes live; everything else
// (series, random rows, library lists) waits for the final full invalidation
// so the page doesn't churn on every progress tick.
const liveRefreshKeys = [
	orpc.books.listRecent.key(),
	orpc.audiobooks.listRecent.key(),
	// Lifts the home empty-state as soon as a first scan imports content.
	orpc.books.availableFormats.key(),
];

// Rebuild tasks don't touch book records (modifiesContent: false), so they're
// absent from CONTENT_TASK_TYPES. Refresh the recommendation rows on their own
// so a manual rebuild shows up without a page reload.
const RECOMMENDATION_TASK_TYPES: ReadonlySet<string> = new Set([
	"recommendations-rebuild",
	"recommendations-rebuild-global",
	"recommendations-feeds",
]);
const READ_LISTEN_TASK_TYPES: ReadonlySet<string> = new Set([
	"read-listen-generation",
	"read-listen-match-analysis",
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

function refreshReadListenForTask(task: Task) {
	if (!READ_LISTEN_TASK_TYPES.has(task.type) || task.status === "running") {
		return;
	}
	queryClient.invalidateQueries({ queryKey: orpc.readListen.key() });
}

function updateTasksInCache(tasks: Task[]) {
	// Update getActiveTasks cache
	queryClient.setQueriesData<Task[]>({ queryKey: activeTasksKey }, (old) => {
		if (!old) return old;
		return mergeActiveTaskUpdates(old, tasks);
	});

	// Update getAllTasks cache
	queryClient.setQueriesData<Task[]>({ queryKey: allTasksKey }, (old) => {
		if (!old) return old;
		return mergeAllTaskUpdates(old, tasks);
	});

	for (const task of tasks) {
		refreshContentForTask(task);
		refreshRecommendationsForTask(task);
		refreshReadListenForTask(task);
	}
}

const taskUpdateBatcher = createTaskUpdateBatcher(
	updateTasksInCache,
	TASK_UPDATE_BATCH_MS,
);

export function useTaskEvents() {
	// Task progress rides the shared gateway WebSocket. On every (re)connect we
	// refetch the task lists so a stale view re-syncs after a dropped connection.
	useGatewayChannel(
		"tasks",
		(data) => {
			const task = data as Task;
			taskUpdateBatcher.push(task);
		},
		() => {
			taskUpdateBatcher.flushNow();
			queryClient.invalidateQueries({ queryKey: activeTasksKey });
			queryClient.invalidateQueries({ queryKey: allTasksKey });
		},
	);
}
