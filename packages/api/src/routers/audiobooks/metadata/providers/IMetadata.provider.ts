import type { AudiobookMetadata } from "../audiobook-metadata.model";

export interface IAudiobookMetadataProvider {
	/**
	 * Search for audiobook metadata using partial input (title, author, ASIN, etc.).
	 * Returns an array of candidates for the user to choose from.
	 */
	search(
		input: Partial<AudiobookMetadata>,
		region?: string,
	): Promise<Partial<AudiobookMetadata>[]>;

	/**
	 * Get full metadata for a specific audiobook by ASIN.
	 */
	getByAsin(
		asin: string,
		region?: string,
	): Promise<Partial<AudiobookMetadata> | null>;
}
