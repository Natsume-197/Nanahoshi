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

// ─── Manual edit (field locking) ─────────────────────────
// Field names storable in audiobook_metadata.locked_fields: scalar columns
// plus pseudo-fields for the linked entities replaced as a unit.
export const LOCKABLE_AUDIOBOOK_FIELDS = [
	"title",
	"subtitle",
	"description",
	"publishedDate",
	"languageCode",
	"isbn",
	"asin",
	"cover",
	"explicit",
	"abridged",
	"authors",
	"narrators",
	"publisher",
	"series",
	"genres",
	"tags",
] as const;

export type LockableAudiobookField = (typeof LOCKABLE_AUDIOBOOK_FIELDS)[number];

// Every present key is saved (null clears) and locked against enrichment.
export const ManualAudiobookMetadataSchema = z.object({
	title: z.string().trim().min(1).max(255).nullable().optional(),
	subtitle: z.string().trim().min(1).max(255).nullable().optional(),
	description: z.string().nullable().optional(),
	publishedDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.optional(),
	languageCode: z.string().trim().min(1).max(8).nullable().optional(),
	isbn: z.string().trim().min(1).max(32).nullable().optional(),
	asin: z.string().trim().min(1).max(32).nullable().optional(),
	explicit: z.boolean().nullable().optional(),
	abridged: z.boolean().nullable().optional(),
	authors: z.array(AudiobookAuthorSchema).optional(),
	narrators: z.array(AudiobookNarratorSchema).optional(),
	publisher: z.string().trim().min(1).nullable().optional(),
	series: AudiobookSeriesSchema.nullable().optional(),
	genres: z.array(z.string().trim().min(1)).optional(),
	tags: z.array(z.string().trim().min(1)).optional(),
});

export type ManualAudiobookMetadata = z.infer<
	typeof ManualAudiobookMetadataSchema
>;

export const UpdateAudiobookMetadataInput = z.object({
	uuid: z.string().uuid(),
	metadata: ManualAudiobookMetadataSchema,
	unlockFields: z.array(z.enum(LOCKABLE_AUDIOBOOK_FIELDS)).optional(),
});

// ─── Types ───────────────────────────────────────────────
export type AudiobookMetadata = z.infer<typeof AudiobookMetadataSchema>;
export type AudiobookAuthor = z.infer<typeof AudiobookAuthorSchema>;
export type AudiobookNarrator = z.infer<typeof AudiobookNarratorSchema>;
export type AudiobookSeries = z.infer<typeof AudiobookSeriesSchema>;
