import {
	bigint,
	bigserial,
	boolean,
	date,
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

export const appSettings = pgTable("app_settings", {
	id: serial("id").primaryKey(),
	key: text("key").notNull(),
	value: jsonb("value").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
	],
);

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
		isPublic: boolean("is_public").default(false).notNull(),
		organizationId: text("organization_id").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.organizationId],
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
		isEnabled: boolean("is_enabled"),
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

export const userLibrary = pgTable(
	"user_library",
	{
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.defaultNow()
			.notNull(),
		userId: text("user_id"),
		libraryId: bigint("library_id", { mode: "number" }),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.libraryId] }),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "user_library_user_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
		foreignKey({
			columns: [table.libraryId],
			foreignColumns: [library.id],
			name: "user_library_library_id_fkey",
		})
			.onUpdate("cascade")
			.onDelete("cascade"),
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
		mediaType: varchar("media_type", { length: 16 }),
		filehash: text().notNull(),
		relativePath: text("relative_path"),
		uuid: uuid("uuid").notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "books_user_id_fkey",
		}).onUpdate("cascade"),
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
	},
	(table) => [unique("publishers_name_key").on(table.name)],
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
		seriesId: integer("series_id"),
		titleRomaji: varchar("title_romaji"),
		mainColor: varchar("main_color"),
	},
	(table) => [
		foreignKey({
			columns: [table.publisherId],
			foreignColumns: [publisher.id],
			name: "book_metadata_publisher_id_fkey",
		}),
		foreignKey({
			columns: [table.seriesId],
			foreignColumns: [series.id],
			name: "book_metadata_series_id_fkey",
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

export const series = pgTable("series", {
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
});

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
	},
	(table) => [
		unique("authors_provider_name_key").on(table.name, table.provider),
		unique("authors_amazon_asin_key").on(table.amazonAsin),
	],
);

export const collection = pgTable(
	"collection",
	{
		id: uuid().defaultRandom().primaryKey().notNull(),
		userId: text("user_id").notNull(),
		name: text().notNull(),
		description: text(),
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
		unique("collections_user_id_name_key").on(table.userId, table.name),
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
		position: integer(),
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
		}),
		primaryKey({
			columns: [table.seriesId, table.bookId],
			name: "book_series_pkey",
		}),
	],
);

export const likedBook = pgTable(
	"liked_book",
	{
		userId: text("user_id").notNull(),
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
		primaryKey({
			columns: [table.userId, table.bookId],
			name: "liked_books_pkey",
		}),
	],
);

export const readingProgress = pgTable(
	"reading_progress",
	{
		id: bigserial({ mode: "number" }).primaryKey(),
		userId: text("user_id").notNull(),
		bookId: bigint("book_id", { mode: "number" }).notNull(),
		ttuBookId: integer("ttu_book_id"),
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
