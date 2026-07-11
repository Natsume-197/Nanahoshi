import type { AudiobookMetadata } from "../audiobook-metadata.model";

export type AudiobookProviderName = "audible" | "itunes";

export type ProviderRequestOptions = { region?: string };

/**
 * Search result with the provider's own identifier (ASIN for Audible,
 * collectionId for iTunes) — drives the follow-up getById call.
 * previewCover is a remote image URL for pickers; it is never persisted.
 */
export type AudiobookSearchCandidate = Partial<AudiobookMetadata> & {
	provider: AudiobookProviderName;
	providerId: string;
	previewCover?: string;
	/** Provider page for this entry (Audible product page / Apple Books). */
	url?: string;
};

/** Audible/Amazon ASIN: 10 alphanumeric characters. */
export function isValidAsin(value: string | null | undefined): value is string {
	return !!value && /^[A-Z0-9]{10}$/i.test(value.trim());
}

export type ProviderChapters = {
	chapters: { title: string | null; startTime: number; endTime: number }[];
};

export interface IAudiobookMetadataProvider {
	readonly id: AudiobookProviderName;

	/**
	 * Search for audiobook metadata by title/author. Returns lightweight
	 * candidates for matching or user selection.
	 */
	search(
		input: { title?: string; authors?: { name: string }[] },
		options?: ProviderRequestOptions,
	): Promise<AudiobookSearchCandidate[]>;

	/**
	 * Get full metadata for a specific audiobook by provider id. When bookUuid
	 * is given the provider may download the cover for that book.
	 */
	getById(
		providerId: string,
		options?: ProviderRequestOptions & { bookUuid?: string },
	): Promise<Partial<AudiobookMetadata> | null>;

	/** Optional capability — only providers with chapter data implement it. */
	getChapters?(
		providerId: string,
		options?: ProviderRequestOptions,
	): Promise<ProviderChapters | null>;
}
