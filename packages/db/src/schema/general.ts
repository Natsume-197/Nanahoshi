import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	boolean,
	check,
	date,
	doublePrecision,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const appSettings = pgTable(
	"app_settings",
	{
		id: serial("id").primaryKey(),
		key: text("key").notNull(),
		value: jsonb("value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.key)],
);

/**
 * Append-only, instance-wide security trail. These columns intentionally do
 * not carry foreign keys: audit evidence must survive a user or organization
 * being removed. Display names and server names are immutable snapshots taken
 * at the time of the event.
 */
export const securityAuditEvent = pgTable(
	"security_audit_event",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
		eventType: text("event_type").notNull(),
		outcome: text("outcome").notNull(),
		source: text("source").notNull(),
		actorUserId: text("actor_user_id"),
		actorName: text("actor_name"),
		subjectUserId: text("subject_user_id"),
		subjectName: text("subject_name"),
		// Email / username attempted when no account could be resolved.
		subjectIdentifier: text("subject_identifier"),
		sessionId: text("session_id"),
		device: text("device"),
		ipAddress: text("ip_address"),
		serverId: text("server_id"),
		serverName: text("server_name"),
		details: jsonb("details")
			.$type<Record<string, unknown>>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
	},
	(table) => [
		index("security_audit_event_created_at_idx").on(table.createdAt.desc()),
		index("security_audit_event_subject_created_at_idx").on(
			table.subjectUserId,
			table.createdAt.desc(),
		),
		index("security_audit_event_source_outcome_created_at_idx").on(
			table.source,
			table.outcome,
			table.createdAt.desc(),
		),
		index("security_audit_event_server_created_at_idx").on(
			table.serverId,
			table.createdAt.desc(),
		),
	],
);

/**
 * Append-only record of an authorized download delivery. Like security audit
 * rows, snapshots deliberately have no foreign keys so catalog cleanup cannot
 * rewrite administrative history.
 */
export const downloadDeliveryEvent = pgTable(
	"download_delivery_event",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
		deliveryKind: text("delivery_kind")
			.$type<"ebook" | "audiobook" | "audio_file" | "series">()
			.notNull(),
		source: text("source").$type<"web" | "opds" | "api">().notNull(),
		userId: text("user_id").notNull(),
		userName: text("user_name"),
		sessionId: text("session_id"),
		serverId: text("server_id").notNull(),
		serverName: text("server_name"),
		itemUuid: text("item_uuid").notNull(),
		itemTitle: text("item_title").notNull(),
		filename: text("filename").notNull(),
		fileCount: integer("file_count").default(1).notNull(),
		device: text("device"),
		ipAddress: text("ip_address"),
	},
	(table) => [
		index("download_delivery_event_created_at_idx").on(table.createdAt.desc()),
		index("download_delivery_event_user_created_at_idx").on(
			table.userId,
			table.createdAt.desc(),
		),
		index("download_delivery_event_server_created_at_idx").on(
			table.serverId,
			table.createdAt.desc(),
		),
		index("download_delivery_event_item_created_at_idx").on(
			table.itemUuid,
			table.createdAt.desc(),
		),
	],
);

// Per-organization (tenant) settings. Behavioral/credential metadata-source
// config (Amazon domain+cookie, RanobeDB provider toggle) lives here so it
// can't leak across tenants the way a single global app_settings row would.
export const organizationSettings = pgTable(
	"organization_settings",
	{
		id: serial("id").primaryKey(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		value: jsonb("value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.serverId, t.key)],
);

// Per-user (cross-tenant) settings. Client-owned JSON blobs (reader profiles,
// custom reader themes) that follow the user across devices; the server never
// interprets the value.
export const userSettings = pgTable(
	"user_settings",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		key: text("key").notNull(),
		value: jsonb("value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.userId, t.key)],
);

export const scannedFile = pgTable(
	"scanned_file",
	{
		id: serial("id").primaryKey(),
		path: text("path").notNull(),
		libraryPathId: bigint("library_path_id", { mode: "number" }).notNull(),
		size: bigint("size", { mode: "number" }).notNull(),
		mtime: timestamp("mtime").notNull(),
		status: varchar("status", { length: 20 }).notNull(),
		hash: text("hash").notNull(),
		lastSeenScanRunId: uuid("last_seen_scan_run_id"),
		error: text("error"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.libraryPathId],
			foreignColumns: [libraryPath.id],
			name: "scanned_file_library_path_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.lastSeenScanRunId],
			foreignColumns: [scanRun.id],
			name: "scanned_file_last_seen_scan_run_id_fkey",
		}).onDelete("set null"),
		uniqueIndex("scanned_file_path_library_path_idx").on(
			table.path,
			table.libraryPathId,
		),
		// Dedupe groups by content hash across the whole library
		index("scanned_file_hash_idx").on(table.hash),
		index("scanned_file_scan_run_idx").on(table.lastSeenScanRunId),
		// Scan phases filter by library path (+ status, keyset-paged by id);
		// the unique (path, library_path_id) index can't serve these.
		index("scanned_file_library_path_status_id_idx").on(
			table.libraryPathId,
			table.status,
			table.id,
		),
	],
);

/**
 * Directory mtimes are an advisory acceleration index for incremental scans.
 * They are never used by a full reconciliation, because changing bytes inside
 * an existing file does not necessarily update its parent directory's mtime.
 */
export const scannedDirectory = pgTable(
	"scanned_directory",
	{
		id: serial("id").primaryKey(),
		path: text("path").notNull(),
		libraryPathId: bigint("library_path_id", { mode: "number" }).notNull(),
		mtimeMs: bigint("mtime_ms", { mode: "number" }).notNull(),
		completedScanRunId: uuid("completed_scan_run_id"),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.libraryPathId],
			foreignColumns: [libraryPath.id],
			name: "scanned_directory_library_path_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.completedScanRunId],
			foreignColumns: [scanRun.id],
			name: "scanned_directory_completed_scan_run_id_fkey",
		}).onDelete("set null"),
		uniqueIndex("scanned_directory_path_library_path_idx").on(
			table.path,
			table.libraryPathId,
		),
		index("scanned_directory_scan_run_idx").on(table.completedScanRunId),
	],
);

export const libraryMediaTypeEnum = pgEnum("library_media_type", [
	"ebook",
	"audiobook",
]);

/**
 * A library's metadata provider routing, as stored. THE declaration of this
 * shape: the zod schema that validates it, the policy type that normalizes it
 * and the Metadata Profile presets all derive from here, so a new routing key
 * cannot be half-added.
 *
 * `order` is the Provider Order (attempt sequence and default per-field
 * priority); `fields` overrides priority and the allowed set per metadata
 * field; `primary` names the Provider Authority; `profile` records which
 * versioned Metadata Profile produced the config.
 */
export type MetadataProviderRouting = {
	order: string[];
	fields?: Record<string, string[]>;
	primary?: string;
	profile?: { id: string; version: number };
};

/** Legacy shape: a bare ordered chain, still present in older rows. */
export type StoredMetadataProviders = string[] | MetadataProviderRouting;

export const library = pgTable(
	"library",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "library_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: "9223372036854775807",
			cache: 1,
		}),
		uuid: uuid("uuid").defaultRandom().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		name: text(),
		isCronWatch: boolean("is_cron_watch"),
		// Interval (minutes) between scheduled scans when isCronWatch is on
		scanIntervalMinutes: integer("scan_interval_minutes"),
		// React to filesystem changes with a debounced incremental scan.
		realtimeWatchEnabled: boolean("realtime_watch_enabled")
			.default(true)
			.notNull(),
		serverId: text("server_id").notNull(),
		mediaType: libraryMediaTypeEnum("media_type").default("ebook").notNull(),
		// Automatic edition grouping can be disabled per ebook library. Manual
		// groups remain intact regardless of this setting.
		automaticGroupingEnabled: boolean("automatic_grouping_enabled")
			.default(true)
			.notNull(),
		// See StoredMetadataProviders — the one declaration of this shape.
		metadataProviders: jsonb("metadata_providers")
			.$type<StoredMetadataProviders>()
			.default(sql`'["ranobedb","amazon"]'::jsonb`)
			.notNull(),
		// Per-library overrides layered over the org defaults: Amazon store
		// (follows the library's language), Audible region for audiobooks.
		metadataConfig: jsonb("metadata_config")
			.$type<{ amazon?: { domain?: string }; audible?: { region?: string } }>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		// When set, automatic enrichment (file events, duplicate grouping) and
		// scheduled retries are suspended for this library. Explicit user actions
		// (manual retry, approve, fix-match, library-enrich task) still run.
		autoEnrichPausedAt: timestamp("auto_enrich_paused_at", {
			withTimezone: true,
			mode: "string",
		}),
		// Set when a scan finishes (including a cancelled or partially failed one),
		// so the UI can say how current the catalog is without keeping tasks alive.
		lastScannedAt: timestamp("last_scanned_at", {
			withTimezone: true,
			mode: "string",
		}),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
		}).onDelete("cascade"),
		uniqueIndex("library_uuid_idx").on(table.uuid),
	],
);

export const libraryPath = pgTable(
	"library_path",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "library_path_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: "9223372036854775807",
			cache: 1,
		}),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		libraryId: bigint("library_id", { mode: "number" }).notNull(),
		path: text().notNull(),
		isEnabled: boolean("is_enabled").default(true),
		// Last reachability verdict for this folder. A scan that finds the path
		// gone used to only log — the catalog silently stopped growing — so the
		// failure is persisted here and surfaced in the library UI.
		lastError: text("last_error"),
		lastCheckedAt: timestamp("last_checked_at", {
			withTimezone: true,
			mode: "string",
		}),
	},
	(table) => [
		foreignKey({
			columns: [table.libraryId],
			foreignColumns: [library.id],
			name: "library_path_library_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		uniqueIndex("library_path_unique_idx").on(table.libraryId, table.path),
	],
);

export type ScanRunMode = "incremental" | "full";
export type ScanRunPhase =
	| "discovery"
	| "prune"
	| "dedupe"
	| "promote"
	| "enqueue";
export type ScanRunStatus = "active" | "completed" | "failed" | "cancelled";

/** Durable producer-side lifecycle and checkpoint counters for one path scan. */
export const scanRun = pgTable(
	"scan_run",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		taskId: text("task_id").notNull(),
		libraryPathId: bigint("library_path_id", { mode: "number" }).notNull(),
		mode: varchar("mode", { length: 20 }).$type<ScanRunMode>().notNull(),
		phase: varchar("phase", { length: 20 })
			.$type<ScanRunPhase>()
			.notNull()
			.default("discovery"),
		status: varchar("status", { length: 20 })
			.$type<ScanRunStatus>()
			.notNull()
			.default("active"),
		discoveredCount: bigint("discovered_count", { mode: "number" })
			.notNull()
			.default(0),
		stattedCount: bigint("statted_count", { mode: "number" })
			.notNull()
			.default(0),
		hashedCount: bigint("hashed_count", { mode: "number" })
			.notNull()
			.default(0),
		persistedCount: bigint("persisted_count", { mode: "number" })
			.notNull()
			.default(0),
		errorCount: bigint("error_count", { mode: "number" }).notNull().default(0),
		failure: text("failure"),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.libraryPathId],
			foreignColumns: [libraryPath.id],
			name: "scan_run_library_path_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		uniqueIndex("scan_run_task_path_idx").on(table.taskId, table.libraryPathId),
		index("scan_run_path_status_idx").on(table.libraryPathId, table.status),
	],
);

export const book = pgTable(
	"book",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "books_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: "9223372036854775807",
			cache: 1,
		}),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		filename: text().notNull(),
		userId: text("user_id"),
		lastModified: timestamp("last_modified", {
			withTimezone: true,
			mode: "string",
		}),
		filesizeKb: bigint("filesize_kb", { mode: "number" }),
		libraryId: bigint("library_id", { mode: "number" }),
		libraryPathId: bigint("library_path_id", { mode: "number" }),
		mediaType: varchar("media_type", { length: 64 }),
		filehash: text().notNull(),
		relativePath: text("relative_path"),
		uuid: uuid("uuid").notNull(),
		// Duplicate grouping: NULL = canonical/visible; non-null = hidden copy
		// pointing at its canonical book (same logical book, different file).
		duplicateOfBookId: bigint("duplicate_of_book_id", { mode: "number" }),
		// Set when a human grouped/ungrouped this book manually; automation must
		// never change the grouping of a locked book.
		groupLocked: boolean("group_locked").default(false).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "books_user_id_fkey",
		}).onUpdate("cascade"),
		foreignKey({
			columns: [table.duplicateOfBookId],
			foreignColumns: [table.id],
			name: "book_duplicate_of_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.libraryId],
			foreignColumns: [library.id],
			name: "books_library_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.libraryPathId],
			foreignColumns: [libraryPath.id],
			name: "books_library_path_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		uniqueIndex("books_filehash_per_library_idx").on(
			table.libraryId,
			table.filehash,
		),
		uniqueIndex("book_uuid_idx").on(table.uuid),
		index("book_library_id_idx").on(table.libraryId),
		// The file-event worker looks up books by (libraryPathId, relativePath)
		// for every scanned file
		index("book_library_path_relative_path_idx").on(
			table.libraryPathId,
			table.relativePath,
		),
		index("book_duplicate_of_idx").on(table.duplicateOfBookId),
		// Every "recent" listing (dashboard rows, catalog default sort) orders by
		// created_at DESC + LIMIT; without this the sort spills to disk at 40k+ books.
		index("book_created_at_idx").on(table.createdAt.desc()),
	],
);

/**
 * A human-confirmed pairing of concrete source publications for synchronized
 * reading and listening. The pair is shared by the organization and remains
 * independent from any derived alignment attempt or artifact.
 */
export const readListenPair = pgTable(
	"read_listen_pair",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		ebookBookId: bigint("ebook_book_id", { mode: "number" }).notNull(),
		audiobookBookId: bigint("audiobook_book_id", { mode: "number" }).notNull(),
		createdByUserId: text("created_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.ebookBookId],
			foreignColumns: [book.id],
			name: "read_listen_pair_ebook_book_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.audiobookBookId],
			foreignColumns: [book.id],
			name: "read_listen_pair_audiobook_book_id_fkey",
		}).onDelete("cascade"),
		uniqueIndex("read_listen_pair_sources_idx").on(
			table.ebookBookId,
			table.audiobookBookId,
		),
		index("read_listen_pair_server_idx").on(table.serverId),
		index("read_listen_pair_ebook_idx").on(table.ebookBookId),
		index("read_listen_pair_audiobook_idx").on(table.audiobookBookId),
		check(
			"read_listen_pair_distinct_sources_check",
			sql`${table.ebookBookId} <> ${table.audiobookBookId}`,
		),
	],
);

export type ReadListenPair = typeof readListenPair.$inferSelect;

export const readListenMatchProposalStatusEnum = pgEnum(
	"read_listen_match_proposal_status",
	["pending", "decided", "superseded"],
);

export const readListenMatchConfidenceEnum = pgEnum(
	"read_listen_match_confidence",
	["high", "medium", "low"],
);

/**
 * An immutable, explainable matcher result. Proposals never create a pairing
 * by themselves; a human decision is required before Read & Listen changes.
 */
export const readListenMatchProposal = pgTable(
	"read_listen_match_proposal",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		audiobookBookId: bigint("audiobook_book_id", { mode: "number" })
			.notNull()
			.references(() => book.id, { onDelete: "cascade" }),
		ebookBookId: bigint("ebook_book_id", { mode: "number" })
			.notNull()
			.references(() => book.id, { onDelete: "cascade" }),
		score: integer("score").notNull(),
		confidence: readListenMatchConfidenceEnum("confidence").notNull(),
		reasons: jsonb("reasons").$type<string[]>().notNull(),
		warnings: jsonb("warnings").$type<string[]>().notNull(),
		matcherVersion: varchar("matcher_version", { length: 32 }).notNull(),
		status: readListenMatchProposalStatusEnum("status")
			.default("pending")
			.notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("read_listen_match_proposal_identity_idx").on(
			table.serverId,
			table.audiobookBookId,
			table.ebookBookId,
			table.matcherVersion,
		),
		index("read_listen_match_proposal_review_idx").on(
			table.serverId,
			table.status,
			table.score.desc(),
		),
		index("read_listen_match_proposal_audiobook_idx").on(table.audiobookBookId),
		check(
			"read_listen_match_proposal_score_check",
			sql`${table.score} between 0 and 100`,
		),
		check(
			"read_listen_match_proposal_distinct_sources_check",
			sql`${table.ebookBookId} <> ${table.audiobookBookId}`,
		),
	],
);

/** One completed deterministic matcher pass for an audiobook and rule version. */
export const readListenMatchEvaluation = pgTable(
	"read_listen_match_evaluation",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		audiobookBookId: bigint("audiobook_book_id", { mode: "number" })
			.notNull()
			.references(() => book.id, { onDelete: "cascade" }),
		matcherVersion: varchar("matcher_version", { length: 32 }).notNull(),
		candidateCount: integer("candidate_count").notNull(),
		proposalCount: integer("proposal_count").notNull(),
		maxScore: integer("max_score"),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("read_listen_match_evaluation_identity_idx").on(
			table.serverId,
			table.audiobookBookId,
			table.matcherVersion,
		),
		index("read_listen_match_evaluation_server_idx").on(table.serverId),
		check(
			"read_listen_match_evaluation_counts_check",
			sql`${table.candidateCount} >= 0 and ${table.proposalCount} >= 0 and ${table.proposalCount} <= ${table.candidateCount}`,
		),
		check(
			"read_listen_match_evaluation_score_check",
			sql`${table.maxScore} is null or ${table.maxScore} between 0 and 100`,
		),
	],
);

export const readListenMatchAnalysisStatusEnum = pgEnum(
	"read_listen_match_analysis_status",
	["queued", "running", "completed", "failed", "cancelled"],
);
export const readListenMatchAnalysisOutcomeEnum = pgEnum(
	"read_listen_match_analysis_job_outcome",
	["completed", "skipped", "failed"],
);

/** Durable identity and outcome of one human-requested full matcher run. */
export const readListenMatchAnalysis = pgTable(
	"read_listen_match_analysis",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		taskId: text("task_id").notNull().unique(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		requestedByUserId: text("requested_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		matcherVersion: varchar("matcher_version", { length: 32 }).notNull(),
		status: readListenMatchAnalysisStatusEnum("status")
			.default("queued")
			.notNull(),
		candidateCount: integer("candidate_count").default(0).notNull(),
		completedCount: integer("completed_count").default(0).notNull(),
		skippedCount: integer("skipped_count").default(0).notNull(),
		failedCount: integer("failed_count").default(0).notNull(),
		proposalCount: integer("proposal_count").default(0).notNull(),
		error: text("error"),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
		startedAt: timestamp("started_at", {
			withTimezone: true,
			mode: "string",
		}),
		finishedAt: timestamp("finished_at", {
			withTimezone: true,
			mode: "string",
		}),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("read_listen_match_analysis_server_idx").on(
			table.serverId,
			table.createdAt.desc(),
		),
		uniqueIndex("read_listen_match_analysis_active_idx")
			.on(table.serverId, table.requestedByUserId, table.matcherVersion)
			.where(sql`${table.status} in ('queued', 'running')`),
		check(
			"read_listen_match_analysis_counts_check",
			sql`${table.candidateCount} >= 0 and ${table.completedCount} >= 0 and ${table.skippedCount} >= 0 and ${table.failedCount} >= 0 and ${table.proposalCount} >= 0 and ${table.completedCount} + ${table.skippedCount} + ${table.failedCount} <= ${table.candidateCount}`,
		),
	],
);

/** Idempotency ledger for one audiobook job within an analysis run. */
export const readListenMatchAnalysisOutcome = pgTable(
	"read_listen_match_analysis_outcome",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		analysisId: uuid("analysis_id")
			.notNull()
			.references(() => readListenMatchAnalysis.id, { onDelete: "cascade" }),
		audiobookUuid: uuid("audiobook_uuid").notNull(),
		outcome: readListenMatchAnalysisOutcomeEnum("outcome").notNull(),
		proposalCount: integer("proposal_count").default(0).notNull(),
		error: text("error"),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("read_listen_match_analysis_outcome_job_idx").on(
			table.analysisId,
			table.audiobookUuid,
		),
	],
);

export const readListenMatchDecisionActionEnum = pgEnum(
	"read_listen_match_decision_action",
	["approve", "reject", "correct"],
);

/** Append-only human feedback for a matcher proposal. */
export const readListenMatchDecision = pgTable(
	"read_listen_match_decision",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		proposalId: uuid("proposal_id")
			.notNull()
			.references(() => readListenMatchProposal.id, { onDelete: "cascade" }),
		action: readListenMatchDecisionActionEnum("action").notNull(),
		// Deliberately not a foreign key: this is an immutable audit snapshot and
		// must survive a corrected publication being deleted later.
		selectedEbookBookId: bigint("selected_ebook_book_id", { mode: "number" }),
		decidedByUserId: text("decided_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("read_listen_match_decision_proposal_idx").on(table.proposalId),
		index("read_listen_match_decision_user_idx").on(table.decidedByUserId),
		check(
			"read_listen_match_decision_selection_check",
			sql`(${table.action} = 'reject' and ${table.selectedEbookBookId} is null) or (${table.action} in ('approve', 'correct') and ${table.selectedEbookBookId} is not null)`,
		),
	],
);

/**
 * The currently imported, source-verified sidecar for a Read & Listen pair.
 * Generation attempts are separate lifecycle records; replacing this row only
 * changes which immutable artifact the reader should consume.
 */
export const readListenAlignment = pgTable(
	"read_listen_alignment",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		pairId: uuid("pair_id")
			.notNull()
			.references(() => readListenPair.id, { onDelete: "cascade" }),
		artifactPath: text("artifact_path").notNull(),
		artifactSha256: varchar("artifact_sha256", { length: 64 }).notNull(),
		sidecarSchema: varchar("sidecar_schema", { length: 64 }).notNull(),
		generatorName: varchar("generator_name", { length: 64 }).notNull(),
		generatorVersion: varchar("generator_version", { length: 64 }).notNull(),
		origin: varchar("origin", { length: 16 }).$type<"external" | "honomiya">(),
		generatedAt: timestamp("generated_at", {
			withTimezone: true,
			mode: "string",
		}).notNull(),
		ebookSha256: varchar("ebook_sha256", { length: 64 }).notNull(),
		audioSha256: jsonb("audio_sha256").$type<string[]>().notNull(),
		ebookCatalogHash: text("ebook_catalog_hash").notNull(),
		audiobookCatalogHash: text("audiobook_catalog_hash").notNull(),
		cueCount: integer("cue_count").notNull(),
		importedAt: timestamp("imported_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("read_listen_alignment_pair_idx").on(table.pairId),
		index("read_listen_alignment_artifact_idx").on(table.artifactSha256),
		check("read_listen_alignment_cue_count_check", sql`${table.cueCount} >= 0`),
		check(
			"read_listen_alignment_origin_check",
			sql`${table.origin} in ('external', 'honomiya')`,
		),
	],
);

export type ReadListenAlignment = typeof readListenAlignment.$inferSelect;

export const readListenGenerationStatusEnum = pgEnum(
	"read_listen_generation_status",
	["queued", "running", "completed", "failed", "cancelled"],
);

/**
 * One immutable request to derive an alignment with Honomiya. Attempts remain
 * separate from the currently published alignment: a failed regeneration must
 * never make an older, still-valid artifact disappear from the reader.
 */
export const readListenGeneration = pgTable(
	"read_listen_generation",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		pairId: uuid("pair_id")
			.notNull()
			.references(() => readListenPair.id, { onDelete: "cascade" }),
		taskId: text("task_id").notNull().unique(),
		status: readListenGenerationStatusEnum("status")
			.default("queued")
			.notNull(),
		provider: varchar("provider", { length: 32 }).notNull(),
		quality: varchar("quality", { length: 32 }).notNull(),
		requestedByUserId: text("requested_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		ebookCatalogHash: text("ebook_catalog_hash").notNull(),
		audiobookCatalogHash: text("audiobook_catalog_hash").notNull(),
		error: text("error"),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
		startedAt: timestamp("started_at", {
			withTimezone: true,
			mode: "string",
		}),
		finishedAt: timestamp("finished_at", {
			withTimezone: true,
			mode: "string",
		}),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("read_listen_generation_pair_idx").on(table.pairId),
		index("read_listen_generation_status_idx").on(table.status),
		uniqueIndex("read_listen_generation_active_pair_idx")
			.on(table.pairId)
			.where(sql`${table.status} in ('queued', 'running')`),
	],
);

export type ReadListenGeneration = typeof readListenGeneration.$inferSelect;

export const publisher = pgTable(
	"publisher",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
		uuid: uuid("uuid").defaultRandom().notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		name: text().notNull(),
		serverId: text("server_id").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "publisher_server_id_fkey",
		}).onDelete("cascade"),
		unique("publishers_name_key").on(table.serverId, table.name),
		uniqueIndex("publisher_uuid_idx").on(table.uuid),
		index("publisher_server_id_idx").on(table.serverId),
	],
);

export const bookMetadata = pgTable(
	"book_metadata",
	{
		bookId: bigint("book_id", { mode: "number" }).primaryKey().notNull(),
		title: varchar({ length: 255 }),
		subtitle: varchar({ length: 255 }),
		description: text(),
		publishedDate: date("published_date"),
		languageCode: varchar("language_code", { length: 8 }),
		pageCount: integer("page_count"),
		isbn10: varchar("isbn_10", { length: 32 }),
		isbn13: varchar("isbn_13", { length: 32 }),
		asin: varchar({ length: 32 }),
		// Opaque publisher/store id from the EPUB's OPF (no checksum/format to
		// validate) — grouping signal for re-packaged copies of the same edition.
		embeddedUid: varchar("embedded_uid", { length: 64 }),
		cover: varchar({ length: 255 }),
		amountChars: bigint("amount_chars", { mode: "number" }),
		// Prose or a sequence of page images (manga, art book, catalogue), read
		// from the file itself. Providers declare which forms they catalog, so a
		// manga is never matched against the novel it shares a title with.
		contentForm: varchar("content_form", { length: 16 })
			.$type<"text" | "images">()
			.default("text")
			.notNull(),
		publisherId: integer("publisher_id"),
		titleRomaji: varchar("title_romaji"),
		mainColor: varchar("main_color"),
		// Store rating for the book (provider-agnostic; source is in fieldSources).
		rating: doublePrecision("rating"),
		ratingCount: integer("rating_count"),
		// Per-field provenance: { field: { p: providerId, at: ISO timestamp } }.
		// Written on every enrichment/manual save; drives the origin inspector.
		fieldSources: jsonb("field_sources")
			.$type<Record<string, { p: string; at: string }>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		// Field names locked by manual edits — enrichment/rescan never overwrites them.
		lockedFields: text("locked_fields")
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
	},
	(table) => [
		foreignKey({
			columns: [table.publisherId],
			foreignColumns: [publisher.id],
			name: "book_metadata_publisher_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "book_metadata_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		// Publisher pages list a publisher's books via this column.
		index("book_metadata_publisher_id_idx").on(table.publisherId),
		// Title sorts (catalog title_asc/desc, OPDS all-books) at 40k+ rows.
		index("book_metadata_title_idx").on(table.title),
		// Duplicate grouping probes these normalized identifiers for a handful of
		// values at a time. Keep the expressions identical to BookRepository so
		// Postgres can use bitmap index scans instead of scanning all metadata.
		index("book_metadata_normalized_isbn13_idx").on(
			sql`upper(replace(replace(coalesce(${table.isbn13}, ''), '-', ''), ' ', ''))`,
		),
		index("book_metadata_normalized_isbn10_idx").on(
			sql`upper(replace(replace(coalesce(${table.isbn10}, ''), '-', ''), ' ', ''))`,
		),
		index("book_metadata_normalized_asin_idx").on(
			sql`upper(trim(coalesce(${table.asin}, '')))`,
		),
		index("book_metadata_normalized_embedded_uid_idx").on(
			sql`trim(coalesce(${table.embeddedUid}, ''))`,
		),
	],
);

// One row per book (ebook or audiobook): outcome of the last enrichment run.
// Replaces the old amazon_enriched_at / enriched_at flags with provider-agnostic
// state the match-manager UI can list and filter at scale.
export type EnrichmentStatus =
	| "pending"
	| "enriched"
	| "partial"
	| "no_match"
	// Automatic match confirmed on weak evidence (title-only, no hard
	// identifier): terminal for the pipeline, queued for human review.
	| "review";

export type EnrichmentMatch = {
	provider: string;
	providerId: string | null;
	/** The catalog identity was selected explicitly by a person. */
	manual?: boolean;
	/**
	 * The candidate as the provider described it, captured at match time. The
	 * book's own title is the merged result and may since have been edited or
	 * overwritten by a later provider, so it cannot answer "what did the
	 * automatic match actually pick?". Absent on rows matched before this was
	 * recorded.
	 */
	title?: string;
	/**
	 * Catalog Identity Verdict reasons that confirmed the primary match, so a
	 * reviewer can tell an ISBN hit from a title-similarity bridge. Only set on
	 * the primary (first) entry.
	 */
	reasons?: string[];
};

export type EnrichmentDecision = {
	kind: "ambiguous";
	/** At most two viable candidates, bounded by Catalog Enrichment. */
	candidates: EnrichmentMatch[];
};

export type EnrichmentFailure = {
	provider: string;
	phase: "discovery" | "hydration";
	kind: "transient" | "permanent";
	code: string;
	at: string;
	/** Provider cooldown hint — when a retry is expected to succeed. */
	retryAfterMs?: number;
};

export const enrichmentState = pgTable(
	"enrichment_state",
	{
		bookId: bigint("book_id", { mode: "number" }).primaryKey().notNull(),
		status: text("status")
			.$type<EnrichmentStatus>()
			.notNull()
			.default("pending"),
		lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "string" }),
		// Bounded retries for partial matches (audiobook author-less match cap).
		attempts: integer("attempts").notNull().default(0),
		// Automatic retry budget for real external calls. Redis gate checks do
		// not increment it, so waiting through a cooldown never burns attempts.
		providerAttempts: integer("provider_attempts").notNull().default(0),
		matched: jsonb("matched")
			.$type<EnrichmentMatch[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		// A terminal no_match may still carry viable alternatives for a person
		// to resolve. This is deliberately separate from provider failures.
		decision: jsonb("decision").$type<EnrichmentDecision | null>(),
		failures: jsonb("failures")
			.$type<EnrichmentFailure[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		nextRetryAt: timestamp("next_retry_at", {
			withTimezone: true,
			mode: "string",
		}),
		retryGeneration: integer("retry_generation").notNull().default(0),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "enrichment_state_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		// Match-manager buckets filter and count by status at 80k+ rows.
		index("enrichment_state_status_idx").on(table.status),
		// Only scheduled retries are ever leased, and they are a tiny minority of
		// rows — partial keeps the index small and off the write path of every
		// enrichment that leaves next_retry_at NULL.
		index("enrichment_state_retry_due_idx")
			.on(table.nextRetryAt, table.providerAttempts)
			.where(sql`${table.nextRetryAt} IS NOT NULL`),
		// Duplicate grouping resolves already-confirmed provider identities via
		// jsonb containment (provider + providerId) across large libraries.
		index("enrichment_state_matched_gin_idx").using("gin", table.matched),
		check(
			"enrichment_state_retryable_status_check",
			sql`${table.nextRetryAt} IS NULL OR ${table.status} IN ('pending', 'partial')`,
		),
	],
);

export const bookMetadataOriginal = pgTable(
	"book_metadata_original",
	{
		bookId: bigint("book_id", { mode: "number" }).primaryKey().notNull(),
		data: jsonb().notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "book_metadata_original_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

/** Original local metadata for an audiobook, before provider enrichment. */
export const audiobookMetadataOriginal = pgTable(
	"audiobook_metadata_original",
	{
		bookId: bigint("book_id", { mode: "number" }).primaryKey().notNull(),
		data: jsonb().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "audiobook_metadata_original_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
	],
);

export const series = pgTable(
	"series",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "series_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: "9223372036854775807",
			cache: 1,
		}),
		uuid: uuid("uuid").defaultRandom().notNull(),
		name: text().notNull(),
		aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
		description: text(),
		createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
		serverId: text("server_id").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "series_server_id_fkey",
		}).onDelete("cascade"),
		unique("series_name_key").on(table.serverId, table.name),
		uniqueIndex("series_uuid_idx").on(table.uuid),
		index("series_server_id_idx").on(table.serverId),
	],
);

// Identity key for people names: aggressive normalization only for Japanese
// (spaces/separators are not identity there); Latin names stay near-verbatim.
// Must stay in sync with normalizePersonName() in packages/api.
const personNameNormalizedSql = (column: string) =>
	sql.raw(
		`CASE WHEN normalize(${column}, NFKC) ~ '[ぁ-ヶー一-龯々〆]'` +
			` THEN lower(regexp_replace(normalize(${column}, NFKC), '[[:space:]・·=]+', '', 'g'))` +
			` ELSE regexp_replace(btrim(normalize(${column}, NFKC)), '[[:space:]]+', ' ', 'g') END`,
	);

export const author = pgTable(
	"author",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
		uuid: uuid("uuid").defaultRandom().notNull(),
		name: text().notNull(),
		nameNormalized: text("name_normalized")
			.generatedAlwaysAs(personNameNormalizedSql("name"))
			.notNull(),
		description: text(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		amazonAsin: text("amazon_asin"),
		provider: text(),
		serverId: text("server_id").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "author_server_id_fkey",
		}).onDelete("cascade"),
		// Identity is hierarchical: amazon_asin when present (homonyms with
		// distinct ids coexist), otherwise one anonymous row per normalized name.
		uniqueIndex("author_server_name_normalized_key")
			.on(table.serverId, table.nameNormalized)
			.where(sql`amazon_asin IS NULL`),
		unique("authors_amazon_asin_key").on(table.serverId, table.amazonAsin),
		uniqueIndex("author_uuid_idx").on(table.uuid),
		index("author_server_id_idx").on(table.serverId),
	],
);

export const collection = pgTable(
	"collection",
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		userId: text("user_id").notNull(),
		serverId: text("server_id").notNull(),
		name: text().notNull(),
		description: text(),
		isPublic: boolean("is_public").default(false).notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
	},
	(table) => [
		index("idx_collections_user_id").using(
			"btree",
			table.userId.asc().nullsLast(),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "collections_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "collections_server_id_fkey",
		}).onDelete("cascade"),
		unique("collections_user_org_name_key").on(
			table.userId,
			table.serverId,
			table.name,
		),
	],
);

export const bookAuthor = pgTable(
	"book_author",
	{
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		authorId: bigint("author_id", { mode: "number" }).notNull(),
		role: text(),
	},
	(table) => [
		foreignKey({
			columns: [table.authorId],
			foreignColumns: [author.id],
			name: "book_authors_author_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [bookMetadata.bookId],
			name: "book_authors_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.bookId, table.authorId],
			name: "book_authors_pkey",
		}),
		// The PK leads with book_id; author pages and author-name search resolve by author_id.
		index("book_author_author_id_idx").on(table.authorId),
	],
);

export const bookSeries = pgTable(
	"book_series",
	{
		seriesId: bigint("series_id", { mode: "number" }).notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		// double: half-volumes (6.5, 14.5) are common in light novels
		position: doublePrecision(),
	},
	(table) => [
		foreignKey({
			columns: [table.seriesId],
			foreignColumns: [series.id],
			name: "book_series_series_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [bookMetadata.bookId],
			name: "book_series_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.seriesId, table.bookId],
			name: "book_series_pkey",
		}),
		// The PK leads with series_id; book detail and catalog joins look up by book_id.
		index("book_series_book_id_idx").on(table.bookId),
	],
);

export const genre = pgTable(
	"genre",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
		uuid: uuid("uuid").defaultRandom().notNull(),
		name: text().notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		serverId: text("server_id").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "genre_server_id_fkey",
		}).onDelete("cascade"),
		unique("genre_name_key").on(table.serverId, table.name),
		uniqueIndex("genre_uuid_idx").on(table.uuid),
		index("genre_server_id_idx").on(table.serverId),
	],
);

export const bookGenre = pgTable(
	"book_genre",
	{
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		genreId: bigint("genre_id", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [bookMetadata.bookId],
			name: "book_genre_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.genreId],
			foreignColumns: [genre.id],
			name: "book_genre_genre_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.bookId, table.genreId],
			name: "book_genre_pkey",
		}),
		index("book_genre_genre_id_idx").on(table.genreId),
	],
);

export const tag = pgTable(
	"tag",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
		uuid: uuid("uuid").defaultRandom().notNull(),
		name: text().notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		serverId: text("server_id").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "tag_server_id_fkey",
		}).onDelete("cascade"),
		unique("tag_name_key").on(table.serverId, table.name),
		uniqueIndex("tag_uuid_idx").on(table.uuid),
		index("tag_server_id_idx").on(table.serverId),
	],
);

export const bookTag = pgTable(
	"book_tag",
	{
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		tagId: bigint("tag_id", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [bookMetadata.bookId],
			name: "book_tag_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.tagId],
			foreignColumns: [tag.id],
			name: "book_tag_tag_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.bookId, table.tagId],
			name: "book_tag_pkey",
		}),
		index("book_tag_tag_id_idx").on(table.tagId),
	],
);

export const likedBook = pgTable(
	"liked_book",
	{
		userId: text("user_id").notNull(),
		serverId: text("server_id").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "liked_books_user_id_fkey",
		}).onUpdate("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "liked_books_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "liked_books_server_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.userId, table.bookId, table.serverId],
			name: "liked_books_pkey",
		}),
		index("liked_book_user_org_idx").on(table.userId, table.serverId),
		index("liked_book_book_idx").on(table.bookId),
	],
);

export const readingProgress = pgTable(
	"reading_progress",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		userId: text("user_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		exploredCharCount: bigint("explored_char_count", {
			mode: "number",
		}).default(0),
		bookCharCount: bigint("book_char_count", { mode: "number" }).default(0),
		/** Client intent time for bounded last-intent-wins ordering. */
		positionIntentAt: bigint("position_intent_at", { mode: "number" }),
		positionOperationId: varchar("position_operation_id", { length: 36 }),
		positionUpdatedAt: timestamp("position_updated_at", {
			withTimezone: true,
			mode: "string",
		}),
		readingTimeSeconds: integer("reading_time_seconds").default(0),
		status: varchar({ length: 20 }).default("unread"),
		startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
		completedAt: timestamp("completed_at", {
			withTimezone: true,
			mode: "string",
		}),
		lastReadAt: timestamp("last_read_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "reading_progress_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "reading_progress_book_id_fkey",
		}).onDelete("cascade"),
		unique("reading_progress_user_book_unique").on(table.userId, table.bookId),
		index("reading_progress_user_idx").on(table.userId),
		index("reading_progress_user_status_idx").on(table.userId, table.status),
		index("reading_progress_book_status_idx").on(table.bookId, table.status),
	],
);

/** Idempotency ledger for progress syncs. Each entry represents one claimed
 * reading-time slice and prevents retries from counting it twice. */
export const readingProgressSyncOperation = pgTable(
	"reading_progress_sync_operation",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "reading_progress_sync_operation_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "reading_progress_sync_operation_book_id_fkey",
		}).onDelete("cascade"),
		index("reading_progress_sync_operation_created_at_idx").on(table.createdAt),
	],
);

export const shelfStatusEnum = pgEnum("shelf_status", [
	"want_to_read",
	"backlog",
	"reading",
	"completed",
]);

export const userBookShelf = pgTable(
	"user_book_shelf",
	{
		userId: text("user_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		status: shelfStatusEnum().notNull(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.bookId],
			name: "user_book_shelf_pkey",
		}),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_book_shelf_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "user_book_shelf_book_id_fkey",
		}).onDelete("cascade"),
		index("user_book_shelf_user_idx").on(table.userId),
		index("user_book_shelf_status_idx").on(table.userId, table.status),
		index("user_book_shelf_book_idx").on(table.bookId),
	],
);

export const collectionBook = pgTable(
	"collection_book",
	{
		collectionId: uuid("collection_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		addedAt: timestamp("added_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
	},
	(table) => [
		index("idx_collection_books_book_id").using(
			"btree",
			table.bookId.asc().nullsLast().op("int8_ops"),
		),
		index("idx_collection_books_collection_id").using(
			"btree",
			table.collectionId.asc().nullsLast().op("uuid_ops"),
		),
		foreignKey({
			columns: [table.collectionId],
			foreignColumns: [collection.id],
			name: "collection_books_collection_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "collection_books_book_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.collectionId, table.bookId],
			name: "collection_books_pkey",
		}),
	],
);

export const invitationLink = pgTable(
	"invitation_link",
	{
		id: text("id").primaryKey(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		code: text("code").notNull().unique(),
		role: text("role").default("member").notNull(),
		maxUses: integer("max_uses"),
		useCount: integer("use_count").default(0).notNull(),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		expiresAt: timestamp("expires_at"),
		revokedAt: timestamp("revoked_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("invitation_link_org_idx").on(table.serverId),
		index("invitation_link_code_idx").on(table.code),
	],
);

export type InvitationLink = typeof invitationLink.$inferSelect;

export const discordAccessRule = pgTable(
	"discord_access_rule",
	{
		id: text("id").primaryKey(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		guildId: text("guild_id").notNull(),
		roleId: text("role_id"), // null = only guild membership required
		label: text("label"),
		enabled: boolean("enabled").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("discord_access_rule_org_idx").on(table.serverId)],
);

export type DiscordAccessRule = typeof discordAccessRule.$inferSelect;

export const notification = pgTable(
	"notification",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text("type").notNull(),
		payload: jsonb("payload").notNull(),
		readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("notification_user_id_idx").on(table.userId, table.id),
		index("notification_user_unread_idx")
			.on(table.userId)
			.where(sql`${table.readAt} IS NULL`),
	],
);

export type Notification = typeof notification.$inferSelect;

// ─── Audiobook Tables ────────────────────────────────────────────────────────

export const audiobookMetadata = pgTable(
	"audiobook_metadata",
	{
		bookId: bigint("book_id", { mode: "number" }).primaryKey().notNull(),
		title: varchar({ length: 255 }),
		subtitle: varchar({ length: 255 }),
		description: text(),
		publishedDate: date("published_date"),
		languageCode: varchar("language_code", { length: 8 }),
		isbn: varchar({ length: 32 }),
		asin: varchar({ length: 32 }),
		cover: varchar({ length: 255 }),
		duration: doublePrecision(),
		codec: varchar({ length: 32 }),
		bitRate: integer("bit_rate"),
		channels: integer(),
		sampleRate: integer("sample_rate"),
		explicit: boolean(),
		abridged: boolean(),
		publisherId: integer("publisher_id"),
		ebookFile: jsonb("ebook_file"),
		mainColor: varchar("main_color"),
		// Per-field provenance: { field: { p: providerId, at: ISO timestamp } }.
		fieldSources: jsonb("field_sources")
			.$type<Record<string, { p: string; at: string }>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		// Field names locked by manual edits — enrichment/rescan never overwrites them.
		lockedFields: text("locked_fields")
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "audiobook_metadata_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.publisherId],
			foreignColumns: [publisher.id],
			name: "audiobook_metadata_publisher_id_fkey",
		}).onDelete("set null"),
		// Title sorts drive from this index (see orderedCatalogIds).
		index("audiobook_metadata_title_idx").on(table.title),
	],
);

export const audioFile = pgTable(
	"audio_file",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		index: integer().notNull(),
		filename: text().notNull(),
		path: text().notNull(),
		filesize: bigint({ mode: "number" }),
		duration: doublePrecision().notNull(),
		codec: varchar({ length: 32 }),
		bitRate: integer("bit_rate"),
		channels: integer(),
		sampleRate: integer("sample_rate"),
		format: varchar({ length: 32 }),
		mimeType: varchar("mime_type", { length: 128 }),
		discNumber: integer("disc_number"),
		trackNumber: integer("track_number"),
		metaTags: jsonb("meta_tags").$type<Record<string, string>>(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "audio_file_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		uniqueIndex("audio_file_book_index_idx").on(table.bookId, table.index),
		index("audio_file_book_id_idx").on(table.bookId),
	],
);

export const audiobookChapter = pgTable(
	"audiobook_chapter",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		index: integer().notNull(),
		title: text(),
		startTime: doublePrecision("start_time").notNull(),
		endTime: doublePrecision("end_time").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "audiobook_chapter_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		uniqueIndex("audiobook_chapter_book_index_idx").on(
			table.bookId,
			table.index,
		),
	],
);

export const narrator = pgTable(
	"narrator",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
		uuid: uuid("uuid").defaultRandom().notNull(),
		name: text().notNull(),
		nameNormalized: text("name_normalized")
			.generatedAlwaysAs(personNameNormalizedSql("name"))
			.notNull(),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		serverId: text("server_id").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "narrator_server_id_fkey",
		}).onDelete("cascade"),
		uniqueIndex("narrator_server_name_normalized_key").on(
			table.serverId,
			table.nameNormalized,
		),
		uniqueIndex("narrator_uuid_idx").on(table.uuid),
		index("narrator_server_id_idx").on(table.serverId),
	],
);

export const bookNarrator = pgTable(
	"book_narrator",
	{
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		narratorId: bigint("narrator_id", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [audiobookMetadata.bookId],
			name: "book_narrator_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.narratorId],
			foreignColumns: [narrator.id],
			name: "book_narrator_narrator_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.bookId, table.narratorId],
			name: "book_narrator_pkey",
		}),
		index("book_narrator_narrator_id_idx").on(table.narratorId),
	],
);

export const audiobookAuthor = pgTable(
	"audiobook_author",
	{
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		authorId: bigint("author_id", { mode: "number" }).notNull(),
		role: text(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [audiobookMetadata.bookId],
			name: "audiobook_author_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.authorId],
			foreignColumns: [author.id],
			name: "audiobook_author_author_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.bookId, table.authorId],
			name: "audiobook_author_pkey",
		}),
		index("audiobook_author_author_id_idx").on(table.authorId),
	],
);

export const audiobookSeries = pgTable(
	"audiobook_series",
	{
		seriesId: bigint("series_id", { mode: "number" }).notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		position: doublePrecision(),
	},
	(table) => [
		foreignKey({
			columns: [table.seriesId],
			foreignColumns: [series.id],
			name: "audiobook_series_series_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [audiobookMetadata.bookId],
			name: "audiobook_series_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		primaryKey({
			columns: [table.seriesId, table.bookId],
			name: "audiobook_series_pkey",
		}),
		index("audiobook_series_book_id_idx").on(table.bookId),
	],
);

export const audiobookGenre = pgTable(
	"audiobook_genre",
	{
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		genreId: bigint("genre_id", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [audiobookMetadata.bookId],
			name: "audiobook_genre_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.genreId],
			foreignColumns: [genre.id],
			name: "audiobook_genre_genre_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.bookId, table.genreId],
			name: "audiobook_genre_pkey",
		}),
		index("audiobook_genre_genre_id_idx").on(table.genreId),
	],
);

export const audiobookTag = pgTable(
	"audiobook_tag",
	{
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		tagId: bigint("tag_id", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [audiobookMetadata.bookId],
			name: "audiobook_tag_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.tagId],
			foreignColumns: [tag.id],
			name: "audiobook_tag_tag_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.bookId, table.tagId],
			name: "audiobook_tag_pkey",
		}),
		index("audiobook_tag_tag_id_idx").on(table.tagId),
	],
);

export const listeningProgress = pgTable(
	"listening_progress",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		userId: text("user_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		currentTimeSeconds: doublePrecision("current_time_seconds").default(0),
		durationSeconds: doublePrecision("duration_seconds").default(0),
		listeningTimeSeconds: integer("listening_time_seconds").default(0),
		status: varchar({ length: 20 }).default("unstarted"),
		startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
		completedAt: timestamp("completed_at", {
			withTimezone: true,
			mode: "string",
		}),
		lastListenedAt: timestamp("last_listened_at", {
			withTimezone: true,
			mode: "string",
		}).defaultNow(),
		hideFromContinue: boolean("hide_from_continue").default(false),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "listening_progress_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "listening_progress_book_id_fkey",
		}).onDelete("cascade"),
		unique("listening_progress_user_book_unique").on(
			table.userId,
			table.bookId,
		),
		index("listening_progress_user_idx").on(table.userId),
		index("listening_progress_user_status_idx").on(table.userId, table.status),
		index("listening_progress_book_status_idx").on(table.bookId, table.status),
	],
);

export const audiobookShelfStatusEnum = pgEnum("shelf_status_audiobook", [
	"want_to_listen",
	"backlog",
	"listening",
	"completed",
]);

export const userAudiobookShelf = pgTable(
	"user_audiobook_shelf",
	{
		userId: text("user_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		status: audiobookShelfStatusEnum().notNull(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "string",
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.bookId],
			name: "user_audiobook_shelf_pkey",
		}),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_audiobook_shelf_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "user_audiobook_shelf_book_id_fkey",
		}).onDelete("cascade"),
		index("user_audiobook_shelf_user_idx").on(table.userId),
		index("user_audiobook_shelf_status_idx").on(table.userId, table.status),
		index("user_audiobook_shelf_book_idx").on(table.bookId),
	],
);

// Granular permissions
export const role = pgTable(
	"role",
	{
		id: text("id").primaryKey(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		color: text("color"),
		// Hierarchy: higher = more powerful; @everyone = 0.
		position: integer("position").default(0).notNull(),
		// @everyone: every member has it implicitly, with no member_role row.
		isDefault: boolean("is_default").default(false).notNull(),
		permissions: jsonb("permissions")
			.$type<Record<string, string[]>>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("role_org_name_idx").on(table.serverId, table.name),
		index("role_org_idx").on(table.serverId),
	],
);

export type Role = typeof role.$inferSelect;

export const memberRole = pgTable(
	"member_role",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "member_role_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: "9223372036854775807",
			cache: 1,
		}),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		roleId: text("role_id")
			.notNull()
			.references(() => role.id, { onDelete: "cascade" }),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("member_role_unique_idx").on(table.userId, table.roleId),
		index("member_role_user_org_idx").on(table.userId, table.serverId),
	],
);

export const libraryOverwriteSubjectEnum = pgEnum("library_overwrite_subject", [
	"everyone",
	"role",
	"user",
]);

export const libraryPermissionOverwrite = pgTable(
	"library_permission_overwrite",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "library_permission_overwrite_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: "9223372036854775807",
			cache: 1,
		}),
		libraryId: bigint("library_id", { mode: "number" }).notNull(),
		serverId: text("server_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		subjectType: libraryOverwriteSubjectEnum("subject_type").notNull(),
		// null when subjectType = "everyone"; role.id for "role"; user.id for "user".
		subjectId: text("subject_id"),
		allow: jsonb("allow")
			.$type<Record<string, string[]>>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		deny: jsonb("deny")
			.$type<Record<string, string[]>>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.libraryId],
			foreignColumns: [library.id],
			name: "library_permission_overwrite_library_id_fkey",
		}).onDelete("cascade"),
		uniqueIndex("lpo_unique_idx").on(
			table.libraryId,
			table.subjectType,
			table.subjectId,
		),
		index("lpo_library_idx").on(table.libraryId),
	],
);

export type LibraryPermissionOverwrite =
	typeof libraryPermissionOverwrite.$inferSelect;
