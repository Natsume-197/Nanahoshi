/**
 * Single source of truth for every background task type. Pure data + types (no
 * server-only imports) so the web app can import it; the queue-name → Queue
 * mapping lives server-side in taskManager.
 */

/** Names of the BullMQ queues that carry task-tracked jobs. */
export type QueueName =
	| "file-events"
	| "metadata-enrich"
	| "book-index"
	| "send-to-kindle"
	| "ranobedb-import"
	| "cover-color";

export interface TaskTypeDef {
	/** Default human label; createTask can override it per instance. */
	defaultLabel: string;
	/** Queue holding this task's jobs — used to cancel its pending work. */
	queue: QueueName;
	/** "server" = tenant-scoped; "global" = app-admin only (serverId is null). */
	scope: "server" | "global";
	/** When true, progress/finish refreshes book content in the UI. */
	modifiesContent: boolean;
	/** When true, completion emits a persistent notification. */
	notifyOnFinish: boolean;
}

export const TASK_REGISTRY = {
	"library-scan": {
		defaultLabel: "Scanning library",
		queue: "file-events",
		scope: "server",
		modifiesContent: true,
		notifyOnFinish: true,
	},
	"library-upload": {
		defaultLabel: "Uploading books",
		queue: "file-events",
		scope: "server",
		modifiesContent: true,
		notifyOnFinish: true,
	},
	"metadata-enrich-auto": {
		defaultLabel: "Auto enrich metadata (Amazon)",
		queue: "metadata-enrich",
		scope: "server",
		modifiesContent: true,
		// Big imports keep enriching long after the scan notification; the scan
		// initiator (inherited from the parent task) wants to know when it's done.
		notifyOnFinish: true,
	},
	"metadata-enrich": {
		defaultLabel: "Enrich metadata from Amazon",
		queue: "metadata-enrich",
		scope: "global",
		modifiesContent: true,
		notifyOnFinish: true,
	},
	"metadata-enrich-retry": {
		defaultLabel: "Retry failed Amazon enrichment",
		queue: "metadata-enrich",
		scope: "global",
		modifiesContent: true,
		notifyOnFinish: true,
	},
	"book-reindex": {
		defaultLabel: "Reindex search",
		queue: "book-index",
		scope: "global",
		modifiesContent: false,
		notifyOnFinish: false,
	},
	"send-to-kindle": {
		defaultLabel: "Sending to Kindle",
		queue: "send-to-kindle",
		scope: "server",
		modifiesContent: false,
		notifyOnFinish: true,
	},
	"ranobedb-import": {
		defaultLabel: "Importing RanobeDB database",
		queue: "ranobedb-import",
		scope: "global",
		modifiesContent: false,
		notifyOnFinish: true,
	},
	"cover-color": {
		defaultLabel: "Extract cover colors",
		queue: "cover-color",
		scope: "global",
		modifiesContent: false,
		notifyOnFinish: false,
	},
} as const satisfies Record<string, TaskTypeDef>;

export type TaskType = keyof typeof TASK_REGISTRY;

/** Task types whose jobs create/modify books — drive live content refresh. */
export const CONTENT_TASK_TYPES: ReadonlySet<string> = new Set(
	Object.entries(TASK_REGISTRY)
		.filter(([, def]) => def.modifiesContent)
		.map(([type]) => type),
);
