import type { ContentForm } from "../../../../modules/catalogContentForm";
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
	/**
	 * Public page for a matched record, `{id}` replaced by the providerId, so a
	 * reviewer can verify the pick. Omitted where the URL depends on per-library
	 * configuration (Amazon store domain) and cannot be built from the id alone.
	 */
	recordUrlTemplate?: string;
	/**
	 * Content forms this provider catalogs. Omitted means it takes any book —
	 * only a provider with a genuinely narrow catalog should declare, since a
	 * book no provider covers ends up with no metadata at all.
	 */
	covers?: readonly ContentForm[];
};

/** Whether a provider is worth asking about a book of this form. */
export function providerCoversContentForm(
	provider: MetadataProviderName,
	contentForm: ContentForm | null | undefined,
): boolean {
	const covers = BOOK_PROVIDER_MANIFEST[provider].covers;
	if (!covers || !contentForm) return true;
	return covers.includes(contentForm);
}

export const BOOK_PROVIDER_MANIFEST: Record<
	MetadataProviderName,
	BookProviderManifest
> = {
	ranobedb: {
		label: "RanobeDB",
		recordUrlTemplate: "https://ranobedb.org/book/{id}",
		// A light-novel catalogue: it has no manga, art books or catalogues, and
		// an adaptation shares both title and original author with the novel, so
		// asking anyway returns the novel's record for the wrong book.
		covers: ["text"],
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
		recordUrlTemplate: "https://books.google.com/books?id={id}",
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
		recordUrlTemplate: "https://openlibrary.org{id}",
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
		recordUrlTemplate: "https://www.goodreads.com/book/show/{id}",
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
		recordUrlTemplate: "https://hardcover.app/books/{id}",
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
		recordUrlTemplate: "https://comicvine.gamespot.com/issue/{id}/",
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
