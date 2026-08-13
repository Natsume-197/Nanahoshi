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
	TriangleAlertIcon,
	UploadIcon,
	WandSparklesIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
		// The bookmeter task's single job would read "1 processed" — say what
		// actually happened instead.
		secondary:
			data.taskType === "bookmeter-sync" && !failed
				? m["notifications.task_bookmeter_secondary"]()
				: noChanges
					? data.label
					: `${data.label} · ${taskCounts(data)}`,
	};
}

function attentionSummary(data: NotificationData) {
	if (!data.attention) return null;
	return [
		data.attention.noMatch > 0 &&
			m["enrichment.notif_no_match"]({ count: data.attention.noMatch }),
		data.attention.review > 0 &&
			m["enrichment.notif_review"]({ count: data.attention.review }),
		data.attention.failed > 0 &&
			m["enrichment.notif_failed"]({ count: data.attention.failed }),
	]
		.filter(Boolean)
		.join(" · ");
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
	const attention = attentionSummary(data);
	const interactive = unread || !!data.attention;
	const rowClassName = cn(
		"flex w-full items-start gap-3 rounded-2xl p-3 pe-12 text-start",
		interactive &&
			"cursor-pointer outline-none transition-[background-color,box-shadow] hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/30",
		unread && "bg-muted/60",
	);
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
			<div className="min-w-0 flex-1">
				<div className="flex items-start gap-2">
					{unread && (
						<span
							className="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-primary"
							aria-hidden="true"
						/>
					)}
					<p
						className={cn(
							"text-sm leading-snug",
							unread ? "font-semibold" : "font-medium",
						)}
					>
						{unread && (
							<span className="sr-only">{m["notifications.unread"]()}: </span>
						)}
						{title}
					</p>
				</div>
				<p className="mt-1 line-clamp-2 break-words text-muted-foreground text-xs leading-relaxed">
					{secondary}
				</p>
				{data.attention && (
					<div className="mt-2 flex flex-wrap items-center gap-2">
						<Badge variant="warning">
							<TriangleAlertIcon data-icon="inline-start" />
							{m["enrichment.notif_review_matches"]()}
						</Badge>
						<span className="text-muted-foreground text-xs">{attention}</span>
					</div>
				)}
				<time
					className="mt-1.5 block text-muted-foreground/80 text-xs leading-none"
					dateTime={new Date(notification.createdAt).toISOString()}
				>
					{formatRelativeTime(notification.createdAt)}
				</time>
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
							? m["notifications.review_notification"]({ title })
							: m["notifications.mark_read"]({ title })
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
				aria-label={m["notifications.delete_named"]({ title })}
				title={m["notifications.delete"]()}
				onClick={() => onDelete(notification)}
				disabled={isDeleting}
				aria-busy={isDeleting}
				className="absolute end-1.5 top-1.5"
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
