type TaskStatus = "running" | "completed" | "cancelled" | "failed";

/**
 * An upload answers once the file is on disk; reading it into a book (title,
 * cover) happens after, in the worker. Refreshing the lists right away shows
 * a half-made "Untitled" book, so wait for those tasks to finish first. Runs
 * past the upload page: people close it long before the worker is done.
 */
export async function followUploadTasks({
	taskIds,
	getStatus,
	onSettled,
	interval = 2000,
	timeout = 3 * 60_000,
	sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
	now = Date.now,
}: {
	taskIds: readonly string[];
	/** null when the server no longer knows the task (pruned = finished). */
	getStatus: (taskId: string) => Promise<TaskStatus | null>;
	onSettled: () => void;
	interval?: number;
	timeout?: number;
	sleep?: (ms: number) => Promise<unknown>;
	now?: () => number;
}): Promise<void> {
	let pending = [...new Set(taskIds)];
	const deadline = now() + timeout;
	while (pending.length > 0 && now() < deadline) {
		await sleep(interval);
		const statuses = await Promise.all(
			pending.map((id) => getStatus(id).catch(() => "running" as const)),
		);
		pending = pending.filter((_, i) => statuses[i] === "running");
	}
	// Past the deadline too: whatever the worker made by now is worth showing.
	onSettled();
}
