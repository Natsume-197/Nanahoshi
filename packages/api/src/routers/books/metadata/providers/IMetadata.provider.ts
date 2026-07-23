import type { CatalogIdentityEvidence } from "../../../../modules/catalogIdentity";
import type { BookMetadata } from "../book.metadata.model";
import type { MetadataProviderName } from "./provider.manifest";

/** Preserves creator roles so illustrators/translators never count as authors. */
export function bookMetadataIdentityEvidence(
	metadata: Partial<BookMetadata>,
): CatalogIdentityEvidence {
	return {
		kind: "book",
		title: metadata.title,
		titleRomaji: metadata.titleRomaji,
		creators: metadata.authors?.map((creator) => ({
			name: creator.name,
			role: creator.role,
		})),
		isbn10: metadata.isbn10,
		isbn13: metadata.isbn13,
		asin: metadata.asin,
		embeddedUid: metadata.embeddedUid,
		languageCode: metadata.languageCode,
	};
}

/**
 * Explicit automatic-match result. Identity stays outside BookMetadata so it
 * cannot be persisted accidentally, while the service can enforce the gate.
 * `identity` is null only when the provider found no candidate.
 */
export type MetadataProviderResult = {
	metadata: Partial<BookMetadata>;
	identity: CatalogIdentityEvidence | null;
};

export function metadataProviderResult(
	metadata: Partial<BookMetadata>,
	identity: CatalogIdentityEvidence,
): MetadataProviderResult {
	return { metadata, identity };
}

export function emptyMetadataProviderResult(): MetadataProviderResult {
	return { metadata: {}, identity: null };
}

export interface IMetadataProvider {
	/**
	 * Obtiene metadata para un libro a partir de la metadata parcial proporcionada.
	 * @param input Metadata parcial (puede contener solo algunos campos).
	 * @returns Metadata parcial y la identidad del candidato que la originó.
	 */
	getMetadata(input: Partial<BookMetadata>): Promise<MetadataProviderResult>;
}

// Manual fix-match: lightweight candidate the user picks from before the full
// record is fetched with getById.
export type BookSearchCandidate = {
	provider: MetadataProviderName;
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
