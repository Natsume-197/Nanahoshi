import { z } from "zod";

// ─── Metadata Sub-Schemas ────────────────────────────────
export const PublisherSchema = z.object({
	uuid: z.string().uuid().optional(),
	name: z.string(),
});

export const AuthorSchema = z.object({
	id: z.number().int().nonnegative().optional(),
	uuid: z.string().uuid().optional(),
	name: z.string(),
	role: z.string().nullable().optional(),
});

export const SeriesSchema = z.object({
	uuid: z.string().uuid().optional(),
	name: z.string(),
	position: z.number().nullable().optional(),
});

export const GenreSchema = z.object({
	uuid: z.string().uuid(),
	name: z.string(),
});

export const MetadataInfoSchema = z.object({
	title: z.string().nullable().optional(),
	titleRomaji: z.string().nullable().optional(),
	subtitle: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	publishedDate: z.string().nullable().optional(),
	languageCode: z.string().nullable().optional(),
	pageCount: z.number().int().nullable().optional(),
	isbn10: z.string().nullable().optional(),
	isbn13: z.string().nullable().optional(),
	asin: z.string().nullable().optional(),
	embeddedUid: z.string().nullable().optional(),
	cover: z.string().nullable(),
	amountChars: z.number().nullable().optional(),
	authors: z.array(AuthorSchema).nullable().optional(),
	publisher: PublisherSchema.optional(),
	series: SeriesSchema.nullable().optional(),
	genres: z
		.array(z.union([z.string(), GenreSchema]))
		.nullable()
		.optional(),
	amazonRating: z.number().nullable().optional(),
	amazonReviewCount: z.number().int().nullable().optional(),
});

// ─── Types ───────────────────────────────────────────────
export type BookMetadata = z.infer<typeof MetadataInfoSchema>;
export type Author = z.infer<typeof AuthorSchema>;
export type Publisher = z.infer<typeof PublisherSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type Genre = z.infer<typeof GenreSchema>;
