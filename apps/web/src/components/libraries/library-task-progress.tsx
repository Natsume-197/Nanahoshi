import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/** Compact progress label per task type — the server-side labels are English. */
const BUSY_LABEL: Record<string, () => string> = {
	"library-scan": () => m["library.busy_scan"](),
	"library-upload": () => m["library.busy_upload"](),
	"library-reprocess": () => m["library.busy_reprocess"](),
	"library-regroup": () => m["library.busy_regroup"](),
	"library-enrich": () => m["library.busy_enrich"](),
};

export function busyLabel(task: Task): string {
	return (BUSY_LABEL[task.type] ?? (() => m["library.busy_generic"]()))();
}

/**
 * The running task per library, keyed by library id. `useTaskEvents` (mounted in
 * the dashboard shell) keeps this cache live over the gateway socket, so callers
 * follow a scan without opening their own subscription.
 */
export function useLibraryTasks(): Map<number, Task> {
	const { data } = useQuery(orpc.tasks.getActiveTasks.queryOptions());
	const byLibrary = new Map<number, Task>();
	for (const task of data ?? []) {
		if (task.libraryId !== null && !byLibrary.has(task.libraryId)) {
			byLibrary.set(task.libraryId, task);
		}
	}
	return byLibrary;
}

/**
 * Live progress for one library operation. `totalJobs === 0` means the producer
 * is still discovering work, so no percentage is shown — it would run backwards
 * as the total grows.
 */
export function LibraryTaskProgress({
	task,
	className,
	barClassName,
}: {
	task: Task;
	className?: string;
	barClassName?: string;
}) {
	const label = busyLabel(task);
	if (task.totalJobs === 0) {
		return (
			<p className={cn("truncate text-primary text-xs", className)}>
				{m["library.busy_preparing"]({ label })}
			</p>
		);
	}

	const done = task.completedJobs + task.failedJobs;
	const percent = Math.min(100, Math.round((done / task.totalJobs) * 100));
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<div
				className={cn(
					"h-1.5 w-24 overflow-hidden rounded-full bg-muted",
					barClassName,
				)}
				role="progressbar"
				aria-valuenow={percent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={label}
			>
				<div
					className="h-full rounded-full bg-primary transition-all duration-300 motion-reduce:transition-none"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<span className="truncate text-primary text-xs tabular-nums">
				{m["library.busy_progress"]({ label, done, total: task.totalJobs })}
			</span>
		</div>
	);
}
