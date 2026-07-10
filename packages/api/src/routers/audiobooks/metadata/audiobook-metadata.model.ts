import { z } from "zod";

// ─── Metadata Sub-Schemas ────────────────────────────────
export const AudiobookAuthorSchema = z.object({
	name: z.string(),
	role: z.string().nullable().optional(),
});

export const AudiobookNarratorSchema = z.object({
	name: z.string(),
});

export const AudiobookSeriesSchema = z.object({
	name: z.string(),
	position: z.number().nullable().optional(),
});

export const AudiobookPublisherSchema = z.object({
	name: z.string(),
});

export const AudiobookMetadataSchema = z.object({
	title: z.string().nullable().optional(),
	subtitle: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	publishedDate: z.string().nullable().optional(),
	languageCode: z.string().nullable().optional(),
	isbn: z.string().nullable().optional(),
	asin: z.string().nullable().optional(),
	cover: z.string().nullable().optional(),
	duration: z.number().nullable().optional(),
	explicit: z.boolean().nullable().optional(),
	abridged: z.boolean().nullable().optional(),
	authors: z.array(AudiobookAuthorSchema).nullable().optional(),
	narrators: z.array(AudiobookNarratorSchema).nullable().optional(),
	publisher: AudiobookPublisherSchema.nullable().optional(),
	series: AudiobookSeriesSchema.nullable().optional(),
	genres: z.array(z.string()).nullable().optional(),
	tags: z.array(z.string()).nullable().optional(),
	// Audible-specific
	audibleRating: z.number().nullable().optional(),
	audibleReviewCount: z.number().int().nullable().optional(),
});

// ─── Types ───────────────────────────────────────────────
export type AudiobookMetadata = z.infer<typeof AudiobookMetadataSchema>;
export type AudiobookAuthor = z.infer<typeof AudiobookAuthorSchema>;
export type AudiobookNarrator = z.infer<typeof AudiobookNarratorSchema>;
export type AudiobookSeries = z.infer<typeof AudiobookSeriesSchema>;
