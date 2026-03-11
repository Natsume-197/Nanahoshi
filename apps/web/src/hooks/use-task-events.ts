import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import { env } from "@nanahoshi-v2/env/web";
import { useEffect } from "react";
import { orpc, queryClient } from "@/utils/orpc";

const activeTasksKey = orpc.tasks.getActiveTasks.queryOptions().queryKey;
const allTasksKey = orpc.tasks.getAllTasks.queryOptions().queryKey;

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
	useEffect(() => {
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
			} catch {
				// ignore parse errors
			}
		};

		return () => {
			eventSource.close();
		};
	}, []);
}
