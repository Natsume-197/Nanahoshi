export type CatalogMediaKind = "book" | "audiobook";

export type CatalogTitleRole = "title" | "romaji";

export type CatalogTitle = {
	value: string;
	role: CatalogTitleRole;
};

export type CatalogCreator = {
	name: string;
	/** Only an explicit author role is identity evidence. */
	role?: string | null;
};

export type CatalogIdentifierScheme =
	| "isbn10"
	| "isbn13"
	| "asin"
	| "embeddedUid";

export type CatalogIdentifier = {
	scheme: CatalogIdentifierScheme;
	value: string;
	/** Number of books carrying an embedded uid in the same library. */
	occurrenceCount?: number;
};

export type CatalogIdentityEvidence = {
	kind?: CatalogMediaKind;
	titles?: readonly CatalogTitle[];
	/** Convenience fields for callers already using BookMetadata-shaped data. */
	title?: string | null;
	titleRomaji?: string | null;
	creators?: readonly CatalogCreator[];
	/** Values in this collection are explicitly authors. */
	authors?: readonly ({ name: string } | string)[] | null;
	identifiers?: readonly CatalogIdentifier[];
	isbn10?: string | null;
	isbn13?: string | null;
	asin?: string | null;
	embeddedUid?: string | null;
	embeddedUidOccurrenceCount?: number;
	languageCode?: string | null;
	/** Audiobook duration in seconds. */
	duration?: number | null;
};

export const CATALOG_IDENTITY_REASONS = {
	TITLE_MATCH: "title.match",
	TITLE_MISSING: "title.missing",
	TITLE_CONFLICT: "title.conflict",
	TITLE_ONLY: "title.only",
	INTERNAL_DISCRIMINATOR_CONFLICT: "discriminator.internal_conflict",
	VOLUME_CONFLICT: "discriminator.volume_conflict",
	PART_CONFLICT: "discriminator.part_conflict",
	PART_MISSING: "discriminator.part_missing",
	SUPPLEMENT_CONFLICT: "discriminator.supplement_conflict",
	CONTENT_EDITION_CONFLICT: "discriminator.content_edition_conflict",
	LANGUAGE_CONFLICT: "language.conflict",
	AUTHOR_MATCH: "author.match",
	AUTHOR_CONFLICT: "author.conflict",
	IDENTIFIER_MATCH: "identifier.match",
	EMBEDDED_UID_MATCH: "embedded_uid.match",
	AUDIO_TITLE_MATCH: "audiobook.title_match",
	AUDIO_ASIN_MATCH: "audiobook.asin_match",
	AUDIO_DURATION_CLOSE: "audiobook.duration_close",
	AUDIO_DURATION_FAR: "audiobook.duration_far",
	GROUP_MEMBER_CONFIRMED: "group.member_confirmed",
	GROUP_MEMBER_REJECTED: "group.member_rejected",
	GROUP_ALL_INDETERMINATE: "group.all_indeterminate",
} as const;

export type CatalogIdentityReason =
	(typeof CATALOG_IDENTITY_REASONS)[keyof typeof CATALOG_IDENTITY_REASONS];

export type CatalogIdentityVerdict = {
	status: "confirmed" | "rejected" | "indeterminate";
	reasons: CatalogIdentityReason[];
};
