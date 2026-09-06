import { sql } from "drizzle-orm";
import {
	bigint,
	check,
	doublePrecision,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { book } from "./general";

const instant = (name: string) =>
	timestamp(name, { withTimezone: true, mode: "string" });

export const readingTrackingPreference = pgTable(
	"reading_tracking_preference",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		mode: text("mode").notNull().default("automatic"),
		idleMinutes: integer("idle_minutes").notNull().default(5),
	},
);
export const readingRun = pgTable(
	"reading_run",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		bookId: bigint("book_id", { mode: "number" })
			.notNull()
			.references(() => book.id, { onDelete: "cascade" }),
		startedAt: instant("started_at").notNull(),
		endedAt: instant("ended_at"),
		closureReason: text("closure_reason").$type<
			"finish" | "leave" | "reread" | "historical_import"
		>(),
		state: text("state").notNull().default("reading"),
	},
	(t) => [
		index("reading_run_owner_book_idx").on(t.userId, t.bookId),
		uniqueIndex("reading_run_current_idx")
			.on(t.userId, t.bookId)
			.where(sql`${t.state} = 'reading'`),
	],
);
export const readingSession = pgTable(
	"reading_session",
	{
		id: uuid("id").primaryKey(),
		runId: uuid("run_id")
			.notNull()
			.references(() => readingRun.id, { onDelete: "cascade" }),
		startedAt: instant("started_at").notNull(),
		endedAt: instant("ended_at"),
		state: text("state").notNull().default("active"),
		mode: text("mode").notNull(),
		source: text("source").notNull(),
		device: text("device").notNull(),
		installationId: uuid("installation_id").notNull(),
		contentVersion: text("content_version").notNull(),
		timeZone: text("time_zone").notNull(),
		revision: integer("revision").notNull().default(0),
		discardedAt: instant("discarded_at"),
	},
	(t) => [index("reading_session_run_idx").on(t.runId, t.startedAt)],
);
export const readingSegment = pgTable(
	"reading_segment",
	{
		id: uuid("id").primaryKey(),
		sessionId: uuid("session_id")
			.notNull()
			.references(() => readingSession.id, { onDelete: "cascade" }),
		startedAt: instant("started_at").notNull(),
		endedAt: instant("ended_at").notNull(),
		seconds: doublePrecision("seconds").notNull(),
		startPosition: doublePrecision("start_position"),
		endPosition: doublePrecision("end_position"),
		startLocator: text("start_locator"),
		endLocator: text("end_locator"),
		kind: text("kind").notNull(),
	},
	(t) => [
		index("reading_segment_session_idx").on(t.sessionId),
		check(
			"reading_segment_duration_check",
			sql`${t.seconds} >= 0 AND ${t.endedAt} >= ${t.startedAt}`,
		),
	],
);
