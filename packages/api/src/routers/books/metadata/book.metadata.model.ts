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
	aliases: z.array(z.string()).optional(),
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
	tags: z.array(z.string()).nullable().optional(),
	amazonRating: z.number().nullable().optional(),
	amazonReviewCount: z.number().int().nullable().optional(),
});

// ─── Manual edit (field locking) ─────────────────────────
// Field names storable in book_metadata.locked_fields: scalar columns plus
// pseudo-fields for the linked entities replaced as a unit during enrichment.
export const LOCKABLE_BOOK_FIELDS = [
	"title",
	"titleRomaji",
	"subtitle",
	"description",
	"publishedDate",
	"languageCode",
	"pageCount",
	"isbn10",
	"isbn13",
	"asin",
	"cover",
	"authors",
	"publisher",
	"series",
	"genres",
	"tags",
] as const;

export type LockableBookField = (typeof LOCKABLE_BOOK_FIELDS)[number];

// Every present key is saved (null clears) and locked against enrichment.
export const ManualBookMetadataSchema = z.object({
	title: z.string().trim().min(1).max(255).nullable().optional(),
	titleRomaji: z.string().trim().min(1).max(255).nullable().optional(),
	subtitle: z.string().trim().min(1).max(255).nullable().optional(),
	description: z.string().nullable().optional(),
	publishedDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.optional(),
	languageCode: z.string().trim().min(1).max(8).nullable().optional(),
	pageCount: z.number().int().positive().nullable().optional(),
	isbn10: z.string().trim().min(1).max(32).nullable().optional(),
	isbn13: z.string().trim().min(1).max(32).nullable().optional(),
	asin: z.string().trim().min(1).max(32).nullable().optional(),
	authors: z
		.array(
			z.object({
				name: z.string().trim().min(1),
				role: z.string().nullable().optional(),
			}),
		)
		.optional(),
	publisher: z.string().trim().min(1).nullable().optional(),
	series: z
		.object({
			name: z.string().trim().min(1),
			position: z.number().nullable().optional(),
		})
		.nullable()
		.optional(),
	genres: z.array(z.string().trim().min(1)).optional(),
	tags: z.array(z.string().trim().min(1)).optional(),
});

export type ManualBookMetadata = z.infer<typeof ManualBookMetadataSchema>;

export const UpdateBookMetadataInput = z.object({
	uuid: z.string().uuid(),
	metadata: ManualBookMetadataSchema,
	unlockFields: z.array(z.enum(LOCKABLE_BOOK_FIELDS)).optional(),
});

// ─── Manual fix-match ────────────────────────────────────
export const BookProviderEnum = z.enum([
	"ranobedb",
	"amazon",
	"googlebooks",
	"openlibrary",
	"goodreads",
	"comicvine",
	"hardcover",
]);

export const SearchBookMetadataInput = z.object({
	uuid: z.string().uuid(),
	provider: BookProviderEnum,
	title: z.string().trim().min(1).max(255).optional(),
	author: z.string().trim().min(1).max(255).optional(),
	asin: z.string().trim().min(1).max(32).optional(),
});

export const ApplyBookMetadataInput = z.object({
	uuid: z.string().uuid(),
	provider: BookProviderEnum,
	providerId: z.string().trim().min(1).max(64),
});

// ─── Types ───────────────────────────────────────────────
export type BookMetadata = z.infer<typeof MetadataInfoSchema>;
export type Author = z.infer<typeof AuthorSchema>;
export type Publisher = z.infer<typeof PublisherSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type Genre = z.infer<typeof GenreSchema>;
