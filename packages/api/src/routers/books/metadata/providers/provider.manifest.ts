import type { BookMetadata } from "../book.metadata.model";

// Single source of truth for ebook metadata providers: ids, labels and the
// fields each one can contribute. Runtime-dependency-free (type-only imports)
// so zod models and pure enrichment logic can import it without pulling
// provider implementations. Implementations bind in ./registry.ts.
//
// Array order = default enrichment chain priority (first = highest).
export const BOOK_PROVIDER_IDS = [
	"ranobedb",
	"amazon",
	"googlebooks",
	"openlibrary",
	"goodreads",
	"hardcover",
	"comicvine",
] as const;

export type MetadataProviderName = (typeof BOOK_PROVIDER_IDS)[number];

export function isBookProviderName(
	value: string,
): value is MetadataProviderName {
	return (BOOK_PROVIDER_IDS as readonly string[]).includes(value);
}

export type BookProviderManifest = {
	/** Human-readable name for UI lists. */
	label: string;
	/** Fields this provider can contribute — drives gap detection and per-field routing. */
	fields: readonly (keyof BookMetadata)[];
};

export const BOOK_PROVIDER_MANIFEST: Record<
	MetadataProviderName,
	BookProviderManifest
> = {
	ranobedb: {
		label: "RanobeDB",
		fields: [
			"titleRomaji",
			"description",
			"publishedDate",
			"pageCount",
			"isbn13",
			"asin",
			"authors",
			"publisher",
			"series",
			"genres",
			"tags",
		],
	},
	amazon: {
		label: "Amazon",
		fields: [
			"description",
			"publishedDate",
			"pageCount",
			"asin",
			"cover",
			"authors",
			"publisher",
			"series",
			"genres",
			"rating",
			"ratingCount",
		],
	},
	googlebooks: {
		label: "Google Books",
		fields: [
			"subtitle",
			"description",
			"publishedDate",
			"languageCode",
			"pageCount",
			"isbn10",
			"isbn13",
			"cover",
			"authors",
			"publisher",
			"series",
			"genres",
		],
	},
	openlibrary: {
		label: "Open Library",
		fields: [
			"description",
			"publishedDate",
			"languageCode",
			"pageCount",
			"isbn10",
			"isbn13",
			"cover",
			"authors",
			"publisher",
			"genres",
		],
	},
	goodreads: {
		label: "Goodreads",
		fields: [
			"description",
			"publishedDate",
			"languageCode",
			"pageCount",
			"isbn10",
			"isbn13",
			"cover",
			"authors",
			"publisher",
			"series",
			"genres",
		],
	},
	hardcover: {
		label: "Hardcover",
		fields: [
			"subtitle",
			"description",
			"publishedDate",
			"languageCode",
			"pageCount",
			"isbn10",
			"isbn13",
			"cover",
			"authors",
			"publisher",
			"series",
			"genres",
			"tags",
		],
	},
	comicvine: {
		label: "Comic Vine",
		fields: [
			"description",
			"publishedDate",
			"cover",
			"authors",
			"publisher",
			"series",
		],
	},
};

// Attribution tag stored on author links; "LOCAL" marks EPUB-extracted data.
export type BookProviderTag = Uppercase<MetadataProviderName> | "LOCAL";

export function bookProviderTag(name: MetadataProviderName): BookProviderTag {
	return name.toUpperCase() as Uppercase<MetadataProviderName>;
}
