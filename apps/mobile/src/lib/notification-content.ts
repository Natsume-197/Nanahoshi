import type { NotificationData } from "@nanahoshi/api/routers/notifications/notification.model";
import type { IconName } from "@/components/icon-names";

type Translate = (
	key: string,
	params?: Record<string, string | number>,
) => string;

// Mirrors apps/web/src/components/notifications/notification-item.tsx so both
// clients title a finished task the same way.
const PLAIN_TITLES: Record<string, string> = {
	"library-scan": "notifications.task_library_scan",
	"library-upload": "notifications.task_library_upload",
	"library-reprocess": "notifications.task_library_reprocess",
	"library-regroup": "notifications.task_library_regroup",
	"library-enrich": "notifications.task_library_enrich",
	"send-to-kindle": "notifications.task_send_to_kindle",
	"ranobedb-import": "notifications.task_ranobedb_import",
	"metadata-enrich": "notifications.task_metadata_enrich",
	"metadata-enrich-retry": "notifications.task_metadata_enrich_retry",
	"metadata-enrich-auto": "notifications.task_metadata_enrich_auto",
	"recommendations-rebuild": "notifications.task_recommendations_rebuild",
	"recommendations-rebuild-global":
		"notifications.task_recommendations_rebuild_global",
	"recommendations-feeds": "notifications.task_recommendations_feeds",
	"read-listen-generation": "notifications.task_read_listen_generation",
};

const SENTENCE_TASKS = new Set([
	"library-scan",
	"library-upload",
	"library-reprocess",
	"library-regroup",
	"library-enrich",
	"send-to-kindle",
	"ranobedb-import",
	"metadata-enrich",
	"metadata-enrich-retry",
	"read-listen-generation",
]);

const SUBJECT_PREFIXES: Record<string, RegExp[]> = {
	"library-scan": [/^Scanning\s+/i],
	"library-upload": [/^Uploading to\s+/i],
	"library-reprocess": [/^Reprocessing\s+/i],
	"library-regroup": [/^Rebuilding edition groups for\s+/i],
	"library-enrich": [
		/^(?:Refreshing (?:metadata|audiobook series)|Rebuilding series) for\s+/i,
	],
	"send-to-kindle": [/^Sending to\s+/i],
	"metadata-enrich": [/^Enrich metadata from\s+/i],
	"metadata-enrich-retry": [/^Retry failed\s+/i],
};
const WHOLE_LABEL_SUBJECTS = new Set(["read-listen-generation"]);
const FIXED_SUBJECTS: Record<string, string> = {
	"ranobedb-import": "RanobeDB",
};

const TASK_ICONS: Record<string, IconName> = {
	"library-scan": { ios: "books.vertical", android: "shelves" },
	"library-upload": { ios: "square.and.arrow.up", android: "upload" },
	"library-reprocess": { ios: "arrow.triangle.2.circlepath", android: "sync" },
	"library-regroup": { ios: "square.stack", android: "stacks" },
	"library-enrich": { ios: "sparkles", android: "auto_awesome" },
	"send-to-kindle": { ios: "paperplane", android: "send" },
	"ranobedb-import": { ios: "cylinder", android: "database" },
	"metadata-enrich": { ios: "wand.and.stars", android: "auto_fix_high" },
	"read-listen-generation": { ios: "book", android: "menu_book" },
};
const DONE_ICON: IconName = {
	ios: "checkmark.circle",
	android: "check_circle",
};
const FAILED_ICON: IconName = { ios: "xmark.circle", android: "cancel" };

/** "Scanning TMW Collection" → "TMW Collection"; null for a nameless label. */
export function notificationSubject(taskType: string, label: string) {
	const fixed = FIXED_SUBJECTS[taskType];
	if (fixed) return fixed;
	if (WHOLE_LABEL_SUBJECTS.has(taskType))
		return label.trim() !== "" ? label.trim() : null;
	for (const pattern of SUBJECT_PREFIXES[taskType] ?? []) {
		const subject = label.replace(pattern, "");
		if (subject !== label && subject.trim() !== "") return subject;
	}
	return null;
}

/** Title, icon and one detail line for a finished-task notification. */
export function notificationContent(data: NotificationData, t: Translate) {
	const failed = data.failedJobs > 0 && data.completedJobs === 0;
	const noChanges =
		data.totalJobs === 0 &&
		(data.taskType === "library-scan" || data.taskType === "library-upload");
	const subject = notificationSubject(data.taskType, data.label);
	let title: string;
	if (noChanges)
		title = subject
			? t("notifications.task_no_changes_sentence", { subject })
			: t("notifications.task_no_changes");
	else if (failed && data.taskType === "send-to-kindle")
		title = subject
			? t("notifications.task_send_to_kindle_failed_sentence", { subject })
			: t("notifications.task_send_to_kindle_failed");
	else if (subject && SENTENCE_TASKS.has(data.taskType))
		title = t(`${PLAIN_TITLES[data.taskType]}_sentence`, { subject });
	else title = t(PLAIN_TITLES[data.taskType] ?? "notifications.task_finished");

	const detail = noChanges
		? null
		: [
				t("notifications.task_processed", { completed: data.completedJobs }),
				data.failedJobs > 0
					? t("notifications.task_failed", { failed: data.failedJobs })
					: null,
			]
				.filter(Boolean)
				.join(" · ");
	return {
		title,
		detail,
		failed,
		icon: failed ? FAILED_ICON : (TASK_ICONS[data.taskType] ?? DONE_ICON),
	};
}
