import type { AudiobookMetadata } from "../audiobook-metadata.model";

// Single source of truth for audiobook metadata providers: ids, labels and the
// fields each one can contribute. Runtime-dependency-free (type-only imports)
// so zod models and pure enrichment logic can import it without pulling
// provider implementations. Implementations bind in ./registry.ts.
//
// Array order = default enrichment chain priority (first = highest).
export const AUDIOBOOK_PROVIDER_IDS = ["audible", "itunes"] as const;

export type AudiobookProviderName = (typeof AUDIOBOOK_PROVIDER_IDS)[number];

export function isAudiobookProviderName(
	value: string,
): value is AudiobookProviderName {
	return (AUDIOBOOK_PROVIDER_IDS as readonly string[]).includes(value);
}

export type AudiobookProviderManifest = {
	/** Human-readable name for UI lists. */
	label: string;
	/** Fields this provider can contribute — drives gap detection and per-field routing. */
	fields: readonly (keyof AudiobookMetadata)[];
	/**
	 * Public page for a matched record, `{id}` replaced by the providerId, so a
	 * reviewer can verify the pick. Omitted where the URL depends on per-library
	 * configuration (Audible region) and cannot be built from the id alone.
	 */
	recordUrlTemplate?: string;
};

export const AUDIOBOOK_PROVIDER_MANIFEST: Record<
	AudiobookProviderName,
	AudiobookProviderManifest
> = {
	audible: {
		label: "Audible",
		fields: [
			"title",
			"subtitle",
			"description",
			"asin",
			"isbn",
			"languageCode",
			"publishedDate",
			"duration",
			"abridged",
			"cover",
			"authors",
			"narrators",
			"publisher",
			"series",
			"genres",
			"tags",
			"audibleRating",
		],
	},
	itunes: {
		label: "Apple iTunes",
		recordUrlTemplate: "https://books.apple.com/audiobook/id{id}",
		fields: [
			"title",
			"description",
			"publishedDate",
			"genres",
			"cover",
			"authors",
		],
	},
};
