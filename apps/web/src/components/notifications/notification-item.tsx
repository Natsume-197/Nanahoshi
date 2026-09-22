import type { NotificationData } from "@nanahoshi/api/routers/notifications/notification.model";
import {
	ArrowsClockwise,
	BookOpen,
	Books,
	CheckCircle,
	Checks,
	CircleNotch,
	Database,
	type Icon,
	MagicWand,
	PaperPlaneTilt,
	Sparkle,
	Stack,
	Trash,
	Upload,
	XCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatRelativeTime } from "@/utils/format";
import type { client } from "@/utils/orpc";

export type NotificationRow = Awaited<
	ReturnType<typeof client.notifications.list>
>[number];

// Short standalone outcomes ("Scan complete"). Used when the label carries
// no name.
const PLAIN_TITLES: Record<string, () => string> = {
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
	"read-listen-generation": m["notifications.task_read_listen_generation"],
};

// Natural-sentence titles with the subject in place ("Scan of TMW finished",
// "TMWのスキャンが完了しました"). Used when the label carries a real name;
// otherwise the short PLAIN_TITLES phrase stands alone.
const SENTENCE_TITLES: Record<string, (subject: string) => string> = {
	"library-scan": (subject) =>
		m["notifications.task_library_scan_sentence"]({ subject }),
	"library-upload": (subject) =>
		m["notifications.task_library_upload_sentence"]({ subject }),
	"library-reprocess": (subject) =>
		m["notifications.task_library_reprocess_sentence"]({ subject }),
	"library-regroup": (subject) =>
		m["notifications.task_library_regroup_sentence"]({ subject }),
	"library-enrich": (subject) =>
		m["notifications.task_library_enrich_sentence"]({ subject }),
	"send-to-kindle": (subject) =>
		m["notifications.task_send_to_kindle_sentence"]({ subject }),
	"ranobedb-import": (subject) =>
		m["notifications.task_ranobedb_import_sentence"]({ subject }),
	"metadata-enrich": (subject) =>
		m["notifications.task_metadata_enrich_sentence"]({ subject }),
	"metadata-enrich-retry": (subject) =>
		m["notifications.task_metadata_enrich_retry_sentence"]({ subject }),
	"bookmeter-sync": (subject) =>
		m["notifications.task_bookmeter_sync_sentence"]({ subject }),
	"read-listen-generation": (subject) =>
		m["notifications.task_read_listen_generation_sentence"]({ subject }),
};

const TASK_ICONS: Record<string, Icon> = {
	"library-scan": Books,
	"library-upload": Upload,
	"library-reprocess": ArrowsClockwise,
	"library-regroup": Stack,
	"library-enrich": Sparkle,
	"send-to-kindle": PaperPlaneTilt,
	"ranobedb-import": Database,
	"metadata-enrich": MagicWand,
	"metadata-enrich-retry": ArrowsClockwise,
	"metadata-enrich-auto": Sparkle,
	"recommendations-rebuild": ArrowsClockwise,
	"recommendations-rebuild-global": ArrowsClockwise,
	"recommendations-feeds": ArrowsClockwise,
	"bookmeter-sync": BookOpen,
	"read-listen-generation": BookOpen,
};

function contentFor(data: NotificationData) {
	const failed = data.failedJobs > 0 && data.completedJobs === 0;
	const noChanges =
		data.totalJobs === 0 &&
		(data.taskType === "library-scan" || data.taskType === "library-upload");
	const subject = notificationSubject(data.taskType, data.label);
	// A no-change task did no work, so library-level attention attached to it
	// is not news from this task: surfacing it reads as a contradiction
	// ("already up to date · 166 to review") and paints a warning that makes
	// no sense. It stays out of the icon, the title and the tap action.
	const showAttention = hasActionableAttention(data);
	let title: string;
	if (noChanges) {
		title = subject
			? m["notifications.task_no_changes_sentence"]({ subject })
			: m["notifications.task_no_changes"]();
	} else if (failed && data.taskType === "send-to-kindle") {
		title = subject
			? m["notifications.task_send_to_kindle_failed_sentence"]({ subject })
			: m["notifications.task_send_to_kindle_failed"]();
	} else {
		const sentence = subject && SENTENCE_TITLES[data.taskType];
		title = sentence
			? sentence(subject)
			: (PLAIN_TITLES[data.taskType]?.() ?? m["notifications.task_finished"]());
	}
	return {
		Icon: noChanges
			? (TASK_ICONS[data.taskType] ?? CheckCircle)
			: failed
				? XCircle
				: (TASK_ICONS[data.taskType] ?? CheckCircle),
		failed,
		subject,
		title,
		showAttention,
	};
}

function attentionCount(data: NotificationData) {
	if (!data.attention) return 0;
	return data.attention.noMatch + data.attention.review + data.attention.failed;
}

/**
 * Whether the attached enrichment attention should surface on this
 * notification at all. A no-change task did no work, so its library-level
 * counts are not news from this task (see contentFor).
 */
export function hasActionableAttention(data: NotificationData) {
	const noChanges =
		data.totalJobs === 0 &&
		(data.taskType === "library-scan" || data.taskType === "library-upload");
	return !noChanges && !!data.attention;
}

export function notificationContextLabel(taskType: string, label: string) {
	const prefixByTask: Record<string, RegExp> = {
		"library-scan": /^Scanning\s+/i,
		"library-upload": /^Uploading to\s+/i,
		"library-reprocess": /^Reprocessing\s+/i,
		"library-regroup": /^Rebuilding edition groups for\s+/i,
		"library-enrich":
			/^(?:Refreshing (?:metadata|audiobook series)|Rebuilding series) for\s+/i,
		"send-to-kindle": /^Sending to\s+/i,
	};
	return label.replace(prefixByTask[taskType] ?? /$^/, "");
}

const SUBJECT_PREFIXES: Record<string, RegExp[]> = {
	"library-scan": [/^Scanning\s+/i],
	"library-upload": [/^Uploading to\s+/i],
	"library-reprocess": [/^Reprocessing\s+/i],
	// Only the "for {name}" form carries a name; the bare default
	// ("Rebuilding edition groups") falls back to the plain title.
	"library-regroup": [/^Rebuilding edition groups for\s+/i],
	"library-enrich": [
		/^(?:Refreshing (?:metadata|audiobook series)|Rebuilding series) for\s+/i,
	],
	"send-to-kindle": [/^Sending to\s+/i],
	"metadata-enrich": [/^Enrich metadata from\s+/i],
	"metadata-enrich-retry": [/^Retry failed\s+/i],
};

// Task types whose whole label IS the subject (no action prefix to strip).
const WHOLE_LABEL_SUBJECTS = new Set(["read-listen-generation"]);

// Task types whose label carries no usable subject: the subject is fixed.
const FIXED_SUBJECTS: Record<string, string> = {
	"ranobedb-import": "RanobeDB",
	"bookmeter-sync": "Bookmeter",
};

/**
 * Derives the subject of a notification title from the task label
 * ("Scanning TMW Collection" → "TMW Collection"). Returns null when the label
 * is a generic action with no name — callers then use the plain title, which
 * reads standalone, so worker jargon never leaks into the UI.
 */
export function notificationSubject(
	taskType: string,
	label: string,
): string | null {
	const fixed = FIXED_SUBJECTS[taskType];
	if (fixed) return fixed;
	if (WHOLE_LABEL_SUBJECTS.has(taskType)) {
		return label.trim() !== "" ? label.trim() : null;
	}
	for (const pattern of SUBJECT_PREFIXES[taskType] ?? []) {
		const subject = label.replace(pattern, "");
		if (subject !== label && subject.trim() !== "") return subject;
	}
	return null;
}

export function notificationRowClassName(
	interactive: boolean,
	unread: boolean,
) {
	return cn(
		"relative flex w-full items-start gap-3 rounded-2xl p-3.5 pe-12 text-start transition-[background-color,box-shadow] hover:bg-foreground/[0.04]",
		interactive &&
			"cursor-pointer outline-none hover:bg-foreground/[0.08] focus-visible:ring-3 focus-visible:ring-ring/30",
		unread && "bg-foreground/[0.05] hover:bg-foreground/[0.08]",
	);
}

/**
 * Renders a sentence title with its subject in semibold, wherever the subject
 * lands in the sentence order of the active locale.
 */
function renderTitle(title: string, subject: string | null) {
	if (!subject) return title;
	const index = title.indexOf(subject);
	if (index < 0) return title;
	return (
		<>
			{title.slice(0, index)}
			<span className="font-semibold">{subject}</span>
			{title.slice(index + subject.length)}
		</>
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
	const { Icon, failed, subject, title, showAttention } = contentFor(data);
	const needsAttention = showAttention ? attentionCount(data) : 0;
	const displayTitle = needsAttention
		? m["notifications.attention_required"]({
				status: title,
				count: needsAttention,
			})
		: title;
	const relativeTime = formatRelativeTime(notification.createdAt);
	// Error details use a native disclosure; do not nest it inside the row button.
	const interactive = !data.error && (unread || showAttention);
	const rowClassName = notificationRowClassName(interactive, unread);
	const body = (
		<>
			<span
				className={cn(
					"flex size-10 shrink-0 items-center justify-center rounded-full",
					failed
						? "bg-destructive/10 text-destructive"
						: showAttention
							? "bg-warning/10 text-warning"
							: "bg-foreground/10 text-muted-foreground",
				)}
				aria-hidden="true"
			>
				<Icon className="size-[1.125rem]" strokeWidth={1.75} />
			</span>
			<div className="min-w-0 flex-1 self-center">
				<p
					className={cn(
						"min-w-0 break-words text-[0.8125rem] leading-snug",
						unread ? "font-semibold" : "font-medium",
					)}
				>
					{unread && (
						<span className="sr-only">{m["notifications.unread"]()}: </span>
					)}
					{renderTitle(displayTitle, subject)}
				</p>
				<p className="mt-0.5 break-words text-muted-foreground text-xs leading-relaxed">
					<time dateTime={new Date(notification.createdAt).toISOString()}>
						{relativeTime}
					</time>
					{data.failedJobs > 0 && (
						<>
							{" "}
							·{" "}
							<span className="font-medium text-destructive">
								{m["notifications.task_failed"]({ failed: data.failedJobs })}
							</span>
						</>
					)}
					{(data.deferredJobs ?? 0) > 0 && (
						<>
							{" "}
							·{" "}
							<span className="font-medium text-warning">
								{m["notifications.task_deferred"]({
									deferred: data.deferredJobs ?? 0,
								})}
							</span>
						</>
					)}
				</p>
				{data.error && (
					<details className="mt-2 text-xs">
						<summary className="cursor-pointer text-destructive underline underline-offset-2">
							{m["notifications.show_error"]()}
						</summary>
						<p className="mt-1 whitespace-pre-wrap break-words text-destructive/90">
							{data.error}
						</p>
					</details>
				)}
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
						showAttention
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
			{/* Row action swaps with read state: an unread row offers marking it
			read (same as tapping the row); once read it offers deletion. */}
			{unread ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-lg"
					aria-label={m["notifications.mark_read"]({ title: displayTitle })}
					title={m["notifications.mark_read"]({ title: displayTitle })}
					onClick={() => onSelect(notification)}
					className="absolute end-1.5 top-1.5"
				>
					<Checks />
				</Button>
			) : (
				<Button
					type="button"
					variant="ghost"
					size="icon-lg"
					aria-label={m["notifications.delete_named"]({ title: displayTitle })}
					title={m["notifications.delete"]()}
					onClick={() => onDelete(notification)}
					disabled={isDeleting}
					aria-busy={isDeleting}
					className="absolute end-1.5 top-1.5"
				>
					{isDeleting ? <CircleNotch className="animate-spin" /> : <Trash />}
				</Button>
			)}
		</div>
	);
}
