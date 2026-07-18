import type { BookMetadata } from "../book.metadata.model";

export interface IMetadataProvider {
	/**
	 * Obtiene metadata para un libro a partir de la metadata parcial proporcionada.
	 * @param input Metadata parcial (puede contener solo algunos campos).
	 * @returns Metadata parcial con los campos que este provider puede aportar.
	 */
	getMetadata(input: Partial<BookMetadata>): Promise<Partial<BookMetadata>>;
}

// Manual fix-match: lightweight candidate the user picks from before the full
// record is fetched with getById.
export type BookSearchCandidate = {
	// Keep in sync with MetadataProviderName (metadata.service.ts) and
	// BookProviderEnum (book.metadata.model.ts).
	provider:
		| "ranobedb"
		| "amazon"
		| "googlebooks"
		| "openlibrary"
		| "goodreads"
		| "comicvine"
		| "hardcover";
	/** Provider-native id as string (RanobeDB book id, ASIN, GB volume id, OL key, …). */
	providerId: string;
	title: string;
	titleRomaji?: string | null;
	authors?: { name: string }[];
	series?: { name: string; position?: number | null } | null;
	publishedDate?: string | null;
	/** Absolute preview image URL (RanobeDB CDN / Amazon search thumbnail). */
	previewCover?: string | null;
	/** Provider page for this entry (ranobedb.org / amazon product page). */
	url?: string | null;
};

export interface ISearchableMetadataProvider extends IMetadataProvider {
	/**
	 * Whether the provider can actually serve requests for this tenant:
	 * enabled AND carrying any required credential. Drives which fix-match
	 * tabs the UI shows.
	 */
	isAvailable(serverId: string | null | undefined): Promise<boolean>;
	search(
		input: { title?: string; author?: string },
		options?: { serverId?: string | null; amazonDomain?: string },
	): Promise<BookSearchCandidate[]>;
	getById(
		providerId: string,
		options?: {
			serverId?: string | null;
			amazonDomain?: string;
			uuid?: string;
			// Candidate previews only: keeps `cover` as the remote URL instead of
			// downloading it. Never save a result fetched with this flag.
			keepRemoteCover?: boolean;
		},
	): Promise<Partial<BookMetadata> | null>;
}
