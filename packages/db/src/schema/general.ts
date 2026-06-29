import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	boolean,
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
	smallint,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const appSettings = pgTable("app_settings", {
	id: serial("id").primaryKey(),
	key: text("key").notNull(),
	value: jsonb("value").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

export const scannedFile = pgTable(
	"scanned_file",
	{
		id: serial("id").primaryKey(),
		path: text("path").notNull(),
		libraryPathId: bigint("library_path_id", { mode: "number" }).notNull(),
		size: integer("size").notNull(),
		mtime: timestamp("mtime").notNull(),
		status: varchar("status", { length: 20 }).notNull(),
		hash: text("hash").notNull(),
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
		uniqueIndex("scanned_file_path_library_path_idx").on(
			table.path,
			table.libraryPathId,
		),
		// Dedupe groups by content hash across the whole library
		index("scanned_file_hash_idx").on(table.hash),
	],
);

export const libraryMediaTypeEnum = pgEnum("library_media_type", [
	"ebook",
	"audiobook",
]);

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
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		name: text(),
		isCronWatch: boolean("is_cron_watch"),
		// Interval (minutes) between scheduled scans when isCronWatch is on
		scanIntervalMinutes: integer("scan_interval_minutes"),
		isPublic: boolean("is_public").default(false).notNull(),
		serverId: text("server_id").notNull(),
		mediaType: libraryMediaTypeEnum("media_type").default("ebook").notNull(),
		// Ordered metadata provider priority for enrichment (first = highest)
		metadataProviders: jsonb("metadata_providers")
			.$type<string[]>()
			.default(sql`'["ranobedb","amazon"]'::jsonb`)
			.notNull(),
		// Per-library overrides layered over the org defaults: Amazon store
		// (follows the library's language).
		metadataConfig: jsonb("metadata_config")
			.$type<{ amazon?: { domain?: string } }>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
		}).onDelete("cascade"),
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
		index("book_library_id_idx").on(table.libraryId),
		// The file-event worker looks up books by (libraryPathId, relativePath)
		// for every scanned file
		index("book_library_path_relative_path_idx").on(
			table.libraryPathId,
			table.relativePath,
		),
		index("book_duplicate_of_idx").on(table.duplicateOfBookId),
	],
);

export const publisher = pgTable(
	"publisher",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
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
		cover: varchar({ length: 255 }),
		amountChars: bigint("amount_chars", { mode: "number" }),
		publisherId: integer("publisher_id"),
		titleRomaji: varchar("title_romaji"),
		mainColor: varchar("main_color"),
		amazonRating: doublePrecision("amazon_rating"),
		amazonReviewCount: integer("amazon_review_count"),
		amazonEnrichedAt: timestamp("amazon_enriched_at", { withTimezone: true }),
	},
	(table) => [
		foreignKey({
			columns: [table.publisherId],
			foreignColumns: [publisher.id],
			name: "book_metadata_publisher_id_fkey",
		}),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "book_metadata_book_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
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
		name: text().notNull(),
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
		index("series_server_id_idx").on(table.serverId),
	],
);

export const author = pgTable(
	"author",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
		name: text().notNull(),
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
		unique("authors_provider_name_key").on(
			table.serverId,
			table.name,
			table.provider,
		),
		unique("authors_amazon_asin_key").on(table.serverId, table.amazonAsin),
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
		}),
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
	],
);

export const genre = pgTable(
	"genre",
	{
		id: bigserial({ mode: "number" }).primaryKey().notNull(),
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
	],
);

/**
 * Per-server profile overrides (Discord-style). Each row holds a user's
 * bio / banner / avatar *for one community*. Any null column falls back to the
 * global value on the `user` table at read time. The global `user` fields stay
 * the account-level defaults; this table never touches them.
 */
export const serverMemberProfile = pgTable(
	"server_member_profile",
	{
		userId: text("user_id").notNull(),
		serverId: text("server_id").notNull(),
		bio: text("bio"),
		headerImage: text("header_image"),
		image: text("image"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "server_member_profile_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.serverId],
			foreignColumns: [organization.id],
			name: "server_member_profile_server_id_fkey",
		}).onDelete("cascade"),
		primaryKey({
			columns: [table.userId, table.serverId],
			name: "server_member_profile_pkey",
		}),
		index("server_member_profile_org_idx").on(table.serverId),
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

export const activityTypeEnum = pgEnum("activity_type", [
	"started_reading",
	"completed_reading",
	"liked_book",
	"started_listening",
	"completed_listening",
]);

export const activity = pgTable(
	"activity",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		userId: text("user_id").notNull(),
		type: activityTypeEnum().notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "activity_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "activity_book_id_fkey",
		}).onDelete("cascade"),
		index("activity_user_created_idx").on(table.userId, table.createdAt),
		index("activity_created_idx").on(table.createdAt),
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

export const userFollow = pgTable(
	"user_follow",
	{
		followerId: text("follower_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		followingId: text("following_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.followerId, table.followingId],
			name: "user_follow_pkey",
		}),
		index("user_follow_following_idx").on(table.followingId),
	],
);

export const activityLike = pgTable(
	"activity_like",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		activityId: bigint("activity_id", { mode: "number" })
			.notNull()
			.references(() => activity.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.activityId],
			name: "activity_like_pkey",
		}),
		index("activity_like_activity_idx").on(table.activityId),
	],
);

export const activityComment = pgTable(
	"activity_comment",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		activityId: bigint("activity_id", { mode: "number" })
			.notNull()
			.references(() => activity.id, { onDelete: "cascade" }),
		content: text("content").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("activity_comment_activity_idx").on(table.activityId),
		index("activity_comment_user_idx").on(table.userId),
	],
);

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
		}),
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
			name: "narrator_server_id_fkey",
		}).onDelete("cascade"),
		unique("narrator_name_key").on(table.serverId, table.name),
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
		}),
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
	],
);

export const playbackSession = pgTable(
	"playback_session",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		userId: text("user_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		startTime: doublePrecision("start_time"),
		currentTime: doublePrecision("current_time"),
		timeListening: doublePrecision("time_listening"),
		playMethod: smallint("play_method").default(0),
		deviceId: text("device_id"),
		startedAt: timestamp("started_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "playback_session_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.bookId],
			foreignColumns: [book.id],
			name: "playback_session_book_id_fkey",
		}).onDelete("cascade"),
		index("playback_session_user_idx").on(table.userId),
		index("playback_session_book_idx").on(table.bookId),
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
