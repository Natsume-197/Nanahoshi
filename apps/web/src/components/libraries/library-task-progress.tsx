import type { Task } from "@nanahoshi-v2/api/modules/taskManager";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import {
	getLibraryTaskProgressState,
	scanProgressStaleDelay,
} from "./library-task-progress-state";

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

const PHASE_LABEL: Record<
	NonNullable<Task["scanProgress"]>["phase"],
	() => string
> = {
	discovery: () => m["library.scan_phase_discovery"](),
	prune: () => m["library.scan_phase_prune"](),
	dedupe: () => m["library.scan_phase_dedupe"](),
	promote: () => m["library.scan_phase_promote"](),
	enqueue: () => m["library.scan_phase_enqueue"](),
};

/**
 * The running task per library, keyed by library id. `useTaskEvents` (mounted in
 * the dashboard shell) keeps this cache live over the gateway socket, so callers
 * follow a scan without opening their own subscription.
 */
export function useLibraryTasks(): Map<number, Task> {
	const { data: activeTasks } = useQuery(
		orpc.tasks.getActiveTasks.queryOptions(),
	);
	const { data: allTasks } = useQuery(orpc.tasks.getAllTasks.queryOptions());
	const byLibrary = new Map<number, Task>();
	for (const task of activeTasks ?? []) {
		if (task.libraryId !== null && !byLibrary.has(task.libraryId)) {
			byLibrary.set(task.libraryId, task);
		}
	}
	// Keep the latest failed scan visible after it leaves active_tasks. Completed
	// work stays out of the library rows; it is already represented by scan time.
	for (const task of allTasks ?? []) {
		if (
			task.status === "failed" &&
			task.type === "library-scan" &&
			task.libraryId !== null &&
			!byLibrary.has(task.libraryId)
		) {
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
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!task.scanProgress || task.status !== "running") return;
		const timeout = setTimeout(
			() => setNow(Date.now()),
			scanProgressStaleDelay(task.scanProgress.lastProgressAt),
		);
		return () => clearTimeout(timeout);
	}, [task.scanProgress, task.status]);
	const state = getLibraryTaskProgressState(task, now);
	if (state.kind === "failed") {
		return (
			<p
				className={cn("truncate text-destructive text-xs", className)}
				role="alert"
			>
				{m["library.busy_failed"]({
					label,
					reason: state.reason ?? m["library.busy_failed_generic"](),
				})}
			</p>
		);
	}
	if (state.kind === "preparing") {
		return (
			<p
				className={cn("truncate text-primary text-xs", className)}
				role="status"
				aria-live="polite"
			>
				{m["library.busy_preparing"]({ label })}
			</p>
		);
	}
	if (state.kind === "completed") {
		return (
			<p
				className={cn("truncate text-primary text-xs", className)}
				role="status"
			>
				{m["library.busy_completed"]({ label })}
			</p>
		);
	}
	if (state.kind === "scan") {
		const detail = m["library.busy_scan_progress"]({
			label,
			phase: PHASE_LABEL[state.phase](),
			persisted: state.persisted,
			hashed: state.hashed,
			throughput: state.throughput.toFixed(1),
		});
		return (
			<p
				className={cn(
					"truncate text-primary text-xs tabular-nums",
					state.stale && "text-amber-700 dark:text-amber-400",
					className,
				)}
				role="status"
				aria-live="polite"
			>
				{state.stale
					? m["library.busy_scan_stale"]({ progress: detail })
					: detail}
			</p>
		);
	}

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<div
				className={cn(
					"h-1.5 w-24 overflow-hidden rounded-full bg-muted",
					barClassName,
				)}
				role="progressbar"
				aria-valuenow={state.percent}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={label}
			>
				<div
					className="h-full rounded-full bg-primary transition-all duration-300 motion-reduce:transition-none"
					style={{ width: `${state.percent}%` }}
				/>
			</div>
			<span className="truncate text-primary text-xs tabular-nums">
				{m["library.busy_progress"]({
					label,
					done: state.done,
					total: state.total,
				})}
			</span>
		</div>
	);
}
