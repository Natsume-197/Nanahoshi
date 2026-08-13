import type { NotificationData } from "@nanahoshi-v2/api/routers/notifications/notification.model";
import {
	BookOpenCheckIcon,
	CircleCheckIcon,
	CircleXIcon,
	DatabaseIcon,
	ImageIcon,
	Layers3Icon,
	LibraryIcon,
	ListRestartIcon,
	LoaderCircleIcon,
	type LucideIcon,
	RefreshCwIcon,
	SendIcon,
	SparklesIcon,
	Trash2Icon,
	UploadIcon,
	WandSparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatRelativeTime } from "@/utils/format";
import type { client } from "@/utils/orpc";

export type NotificationRow = Awaited<
	ReturnType<typeof client.notifications.list>
>[number];

const TASK_TITLES: Record<string, () => string> = {
	"library-scan": m["notifications.task_library_scan"],
	"library-upload": m["notifications.task_library_upload"],
	"library-reprocess": m["notifications.task_library_reprocess"],
	"library-regroup": m["notifications.task_library_regroup"],
	"library-enrich": m["notifications.task_library_enrich"],
	"send-to-kindle": m["notifications.task_send_to_kindle"],
	"ranobedb-import": m["notifications.task_ranobedb_import"],
	"metadata-enrich": m["notifications.task_metadata_enrich"],
	"metadata-enrich-retry": m["notifications.task_metadata_enrich_retry"],
	"metadata-enrich-auto": m["notifications.task_metadata_enrich_auto"],
	"recommendations-rebuild": m["notifications.task_recommendations_rebuild"],
	"recommendations-rebuild-global":
		m["notifications.task_recommendations_rebuild_global"],
	"recommendations-feeds": m["notifications.task_recommendations_feeds"],
	"bookmeter-sync": m["notifications.task_bookmeter_sync"],
	"cover-backfill": m["notifications.task_cover_backfill"],
	"read-listen-generation": m["notifications.task_read_listen_generation"],
};

const TASK_ICONS: Record<string, LucideIcon> = {
	"library-scan": LibraryIcon,
	"library-upload": UploadIcon,
	"library-reprocess": RefreshCwIcon,
	"library-regroup": Layers3Icon,
	"library-enrich": SparklesIcon,
	"send-to-kindle": SendIcon,
	"ranobedb-import": DatabaseIcon,
	"metadata-enrich": WandSparklesIcon,
	"metadata-enrich-retry": ListRestartIcon,
	"metadata-enrich-auto": SparklesIcon,
	"recommendations-rebuild": RefreshCwIcon,
	"recommendations-rebuild-global": RefreshCwIcon,
	"recommendations-feeds": RefreshCwIcon,
	"bookmeter-sync": BookOpenCheckIcon,
	"cover-backfill": ImageIcon,
	"read-listen-generation": BookOpenCheckIcon,
};

function taskCounts(data: NotificationData) {
	const parts = [
		m["notifications.task_processed"]({ completed: data.completedJobs }),
	];
	if (data.failedJobs > 0) {
		parts.push(m["notifications.task_failed"]({ failed: data.failedJobs }));
	}
	return parts.join(" · ");
}

function contentFor(data: NotificationData) {
	const failed = data.failedJobs > 0 && data.completedJobs === 0;
	const noChanges =
		data.totalJobs === 0 &&
		(data.taskType === "library-scan" || data.taskType === "library-upload");
	return {
		Icon: failed ? CircleXIcon : (TASK_ICONS[data.taskType] ?? CircleCheckIcon),
		failed,
		title: noChanges
			? m["notifications.task_no_changes"]()
			: failed && data.taskType === "send-to-kindle"
				? m["notifications.task_send_to_kindle_failed"]()
				: (TASK_TITLES[data.taskType]?.() ??
					m["notifications.task_finished"]()),
		secondary:
			data.taskType === "bookmeter-sync" && !failed
				? notificationContextLabel(data.taskType, data.label)
				: noChanges
					? notificationContextLabel(data.taskType, data.label)
					: `${notificationContextLabel(data.taskType, data.label)} · ${taskCounts(data)}`,
	};
}

function attentionCount(data: NotificationData) {
	if (!data.attention) return 0;
	return data.attention.noMatch + data.attention.review + data.attention.failed;
}

export function notificationContextLabel(taskType: string, label: string) {
	const prefixByTask: Record<string, RegExp> = {
		"library-scan": /^Scanning\s+/i,
		"library-upload": /^Uploading to\s+/i,
		"library-reprocess": /^Reprocessing\s+/i,
		"library-regroup": /^Rebuilding edition groups for\s+/i,
		"library-enrich": /^Refreshing metadata for\s+/i,
		"send-to-kindle": /^Sending to\s+/i,
	};
	return label.replace(prefixByTask[taskType] ?? /$^/, "");
}

export function notificationRowClassName(
	interactive: boolean,
	unread: boolean,
) {
	return cn(
		"flex w-full items-start gap-3 rounded-2xl p-3 pe-12 text-start transition-[background-color,box-shadow] hover:bg-muted/40",
		interactive &&
			"cursor-pointer outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30",
		unread && "bg-muted/40",
	);
}

export function NotificationItem({
	notification,
	onSelect,
	onDelete,
	isDeleting,
}: {
	notification: NotificationRow;
	onSelect: (notification: NotificationRow) => void;
	onDelete: (notification: NotificationRow) => void;
	isDeleting?: boolean;
}) {
	const data = notification.payload as NotificationData;
	const unread = notification.readAt === null;
	const { Icon, failed, title, secondary } = contentFor(data);
	const needsAttention = attentionCount(data);
	const displayTitle = needsAttention
		? m["notifications.attention_required"]({
				status: title,
				count: needsAttention,
			})
		: title;
	const relativeTime = formatRelativeTime(notification.createdAt);
	const interactive = unread || !!data.attention;
	const rowClassName = notificationRowClassName(interactive, unread);
	const body = (
		<>
			<span
				className={cn(
					"flex size-10 shrink-0 items-center justify-center rounded-xl",
					failed
						? "bg-destructive/10 text-destructive"
						: data.attention
							? "bg-warning/10 text-warning"
							: "bg-muted text-muted-foreground",
				)}
				aria-hidden="true"
			>
				<Icon className="size-[1.125rem]" strokeWidth={1.75} />
			</span>
			<div className="min-w-0 flex-1 self-center">
				<div className="flex items-start gap-2">
					{unread && (
						<span
							className="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-primary"
							aria-hidden="true"
						/>
					)}
					<p
						className={cn(
							"min-w-0 truncate text-sm leading-snug",
							unread ? "font-semibold" : "font-medium",
						)}
					>
						{unread && (
							<span className="sr-only">{m["notifications.unread"]()}: </span>
						)}
						{displayTitle}
					</p>
				</div>
				<p className="mt-1 truncate text-muted-foreground text-xs leading-relaxed">
					{secondary} ·{" "}
					<time dateTime={new Date(notification.createdAt).toISOString()}>
						{relativeTime}
					</time>
				</p>
			</div>
		</>
	);

	return (
		<div className="group relative">
			{interactive ? (
				<button
					type="button"
					className={rowClassName}
					onClick={() => onSelect(notification)}
					aria-label={
						data.attention
							? m["notifications.review_notification"]({
									title: displayTitle,
								})
							: m["notifications.mark_read"]({ title: displayTitle })
					}
				>
					{body}
				</button>
			) : (
				<div className={rowClassName}>{body}</div>
			)}
			<Button
				type="button"
				variant="ghost"
				size="icon-lg"
				aria-label={m["notifications.delete_named"]({ title: displayTitle })}
				title={m["notifications.delete"]()}
				onClick={() => onDelete(notification)}
				disabled={isDeleting}
				aria-busy={isDeleting}
				className="absolute end-1.5 top-1.5 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
			>
				{isDeleting ? (
					<LoaderCircleIcon className="animate-spin" />
				) : (
					<Trash2Icon />
				)}
			</Button>
		</div>
	);
}
