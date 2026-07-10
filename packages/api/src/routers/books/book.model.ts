import type { book } from "@nanahoshi-v2/db/schema/general";
import { z } from "zod";
import { MetadataInfoSchema } from "./metadata/book.metadata.model";

// ─── Base Schemas ────────────────────────────────────────
const BasicInfoSchema = z.object({
	id: z.number().int().nonnegative(),
	filename: z.string(),
	filesizeKb: z.number().nullable().optional(),
	uuid: z.string(),
	mediaType: z.string().nullable().optional(),
	createdAt: z.string(),
	lastModified: z.string().nullable().optional(),
});

const MediaInfoSchema = z.object({
	cover: z.string().nullable().optional(),
	downloadLink: z.string().nullable().optional(),
	color: z.string().nullable().optional(),
});

// ─── Book Schema (Book = Basic + Media + Metadata) ───────
export const BookSchema = BasicInfoSchema.extend(MediaInfoSchema.shape).extend(
	MetadataInfoSchema.shape,
);

// ─── Procedure Input Schemas ─────────────────────────────
export const BookUuidInput = z.object({ uuid: z.string() });

export const ListRecentBooksInput = z
	.object({ limit: z.number().int().min(1).max(50).default(20) })
	.optional();

export const ListRandomBooksInput = z
	.object({ limit: z.number().int().min(1).max(50).default(15) })
	.optional();

const searchFiltersSchema = z
	.object({
		languageCode: z.array(z.string()).optional(),
		publishedDateRange: z
			.object({
				from: z.string().optional(),
				to: z.string().optional(),
			})
			.optional(),
		pageCountRange: z
			.object({
				min: z.number().int().optional(),
				max: z.number().int().optional(),
			})
			.optional(),
		authors: z.array(z.string()).optional(),
		authorUuids: z.array(z.string().uuid()).optional(),
		series: z.array(z.string()).optional(),
		publishers: z.array(z.string()).optional(),
		minRating: z.number().min(0).max(5).optional(),
	})
	.optional();

export const SearchBooksInput = z.object({
	query: z.string().optional(),
	exactMatch: z.boolean().optional(),
	filters: searchFiltersSchema,
	sort: z
		.enum([
			"relevance",
			"newest",
			"oldest",
			"title_asc",
			"title_desc",
			"rating_desc",
		])
		.optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(50).default(20).optional(),
});

export const ListBooksBySeriesInput = z.object({
	seriesUuid: z.string().uuid(),
});

export const ListBooksByGenreInput = z.object({ genreUuid: z.string().uuid() });

export const ListBooksByPublisherInput = z.object({
	publisherUuid: z.string().uuid(),
});

export const ListBooksByLibraryInput = z.object({
	libraryUuid: z.string().uuid(),
	limit: z.number().int().min(1).max(50).default(30),
	cursor: z.number().int().min(0).default(0),
	sort: z.enum(["recent", "title", "author", "rating"]).default("recent"),
	query: z.string().optional(),
	minRating: z.number().min(0).max(5).optional(),
	// Match books carrying ANY of these genre names (book or audiobook genres).
	genres: z.array(z.string()).optional(),
	// Match books whose published_date falls in this year.
	year: z.number().int().optional(),
});

// Server-wide catalog (all accessible libraries), paginated. `mediaType: "all"`
// lists both formats mixed, each row tagged with its own media type.
export const ListAllBooksInput = z.object({
	mediaType: z.enum(["ebook", "audiobook", "all"]).default("ebook"),
	limit: z.number().int().min(1).max(50).default(30),
	cursor: z.number().int().min(0).default(0),
	sort: z.enum(["recent", "title", "author", "rating"]).default("recent"),
	query: z.string().optional(),
	minRating: z.number().min(0).max(5).optional(),
});

export const CountAllBooksInput = z.object({
	mediaType: z.enum(["ebook", "audiobook", "all"]).default("ebook"),
	query: z.string().optional(),
	minRating: z.number().min(0).max(5).optional(),
});

export const CountBooksByLibraryInput = z.object({
	libraryUuid: z.string().uuid(),
	query: z.string().optional(),
	minRating: z.number().min(0).max(5).optional(),
	genres: z.array(z.string()).optional(),
	year: z.number().int().optional(),
});

export const LibraryFacetsInput = z.object({
	libraryUuid: z.string().uuid(),
});

export const GroupAsEditionsInput = z.object({
	uuids: z.array(z.string()).min(2),
});

// ─── Types ──────────────────────────────────────────────
export type BookComplete = z.infer<typeof BookSchema>;

// Database-related types
export type Book = typeof book.$inferSelect;
export type CreateBookInput = typeof book.$inferInsert;
