import type { NotificationData } from "@nanahoshi-v2/api/routers/notifications/notification.model";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatRelativeTime } from "@/utils/format";
import type { client } from "@/utils/orpc";

export type NotificationRow = Awaited<
	ReturnType<typeof client.notifications.list>
>[number];

const SOCIAL_TITLES = {
	follow: m["notifications.follow"],
	follow_back: m["notifications.follow_back"],
	activity_like: m["notifications.activity_like"],
	activity_comment: m["notifications.activity_comment"],
} as const;

const TASK_TITLES: Record<string, () => string> = {
	"library-scan": m["notifications.task_library_scan"],
	"library-upload": m["notifications.task_library_upload"],
	"send-to-kindle": m["notifications.task_send_to_kindle"],
	"ranobedb-import": m["notifications.task_ranobedb_import"],
	"metadata-enrich": m["notifications.task_metadata_enrich"],
	"metadata-enrich-retry": m["notifications.task_metadata_enrich_retry"],
	"metadata-enrich-auto": m["notifications.task_metadata_enrich_auto"],
};

function taskCounts(
	data: Extract<NotificationData, { type: "task_finished" }>,
) {
	const parts = [
		m["notifications.task_processed"]({ completed: data.completedJobs }),
	];
	if (data.failedJobs > 0) {
		parts.push(m["notifications.task_failed"]({ failed: data.failedJobs }));
	}
	return parts.join(" · ");
}

interface ItemContent {
	leading: React.ReactNode;
	title: string;
	secondary: string | null;
}

function contentFor(data: NotificationData): ItemContent {
	if (data.type === "task_finished") {
		const failed = data.failedJobs > 0 && data.completedJobs === 0;
		// Manual scan that found nothing: only the initiator receives it, and
		// "Library updated" would be misleading.
		const noChanges =
			data.totalJobs === 0 &&
			(data.taskType === "library-scan" || data.taskType === "library-upload");
		const Icon = failed ? XCircle : CheckCircle2;
		return {
			leading: (
				<span
					className={cn(
						"flex size-9 shrink-0 items-center justify-center rounded-full",
						failed
							? "bg-destructive/10 text-destructive"
							: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
					)}
				>
					<Icon className="size-4" />
				</span>
			),
			title: noChanges
				? m["notifications.task_no_changes"]()
				: failed && data.taskType === "send-to-kindle"
					? m["notifications.task_send_to_kindle_failed"]()
					: (TASK_TITLES[data.taskType]?.() ??
						m["notifications.task_finished"]()),
			secondary: noChanges ? data.label : `${data.label} · ${taskCounts(data)}`,
		};
	}

	const name = data.actor.name || data.actor.displayUsername || "?";
	return {
		leading: (
			<UserAvatar
				name={name}
				className="size-9 shrink-0"
				fallbackClassName="text-xs"
			/>
		),
		title: SOCIAL_TITLES[data.type]({ name }),
		secondary:
			data.type === "activity_comment"
				? data.excerpt
				: data.type === "activity_like"
					? data.bookTitle
					: null,
	};
}

export function NotificationItem({
	notification,
	onSelect,
	onDelete,
}: {
	notification: NotificationRow;
	onSelect: (notification: NotificationRow) => void;
	onDelete: (notification: NotificationRow) => void;
}) {
	const data = notification.payload as NotificationData;
	const unread = notification.readAt === null;
	const { leading, title, secondary } = contentFor(data);

	const rowClass = cn(
		"flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50",
		unread && "bg-primary/5",
	);
	const rowContent = (
		<>
			{/* Unread marker on the left edge, GitHub-style — keeps the top-right
			    corner free for the hover delete button. */}
			<span
				className={cn(
					"mt-[1.375rem] size-1.5 shrink-0 rounded-full",
					unread ? "bg-primary" : "bg-transparent",
				)}
			/>
			{leading}
			<div className="min-w-0 flex-1">
				<p className="pr-5 text-foreground text-sm leading-snug">{title}</p>
				{secondary && (
					<p className="mt-0.5 line-clamp-2 break-words text-muted-foreground text-xs leading-snug">
						{secondary}
					</p>
				)}
				<p className="mt-0.5 text-muted-foreground/80 text-xs leading-tight">
					{formatRelativeTime(notification.createdAt)}
				</p>
			</div>
		</>
	);

	// The row is itself a Link/button, so the delete control is an absolutely
	// positioned sibling (nested interactive elements are invalid HTML).
	return (
		<div className="group relative">
			{data.type !== "task_finished" && data.actor.username ? (
				<Link
					to="/dashboard/user/$username"
					params={{ username: data.actor.username }}
					className={rowClass}
					onClick={() => onSelect(notification)}
				>
					{rowContent}
				</Link>
			) : (
				<button
					type="button"
					className={rowClass}
					onClick={() => onSelect(notification)}
				>
					{rowContent}
				</button>
			)}
			<button
				type="button"
				aria-label={m["notifications.delete"]()}
				title={m["notifications.delete"]()}
				onClick={() => onDelete(notification)}
				className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
			>
				<X className="size-3.5" />
			</button>
		</div>
	);
}
