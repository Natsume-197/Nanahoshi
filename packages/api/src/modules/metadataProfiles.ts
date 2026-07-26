import type { MetadataProviderName } from "../routers/books/metadata/providers/provider.manifest";
import type { ProviderFieldPolicy } from "./providerPolicy";

export const BOOK_METADATA_PROFILE_IDS = ["general", "light_novels"] as const;

export type BookMetadataProfileId = (typeof BOOK_METADATA_PROFILE_IDS)[number];

export const BOOK_METADATA_PROFILE_VERSION = 1;

/**
 * A preset is the routing policy with two optional parts made mandatory: a
 * profile always names its Provider Authority and records its own identity.
 */
export type BookMetadataProfile = Omit<
	ProviderFieldPolicy<MetadataProviderName>,
	"primary" | "profile"
> & {
	primary: MetadataProviderName;
	profile: {
		id: BookMetadataProfileId;
		version: typeof BOOK_METADATA_PROFILE_VERSION;
	};
};

const BOOK_METADATA_PROFILES: Record<
	BookMetadataProfileId,
	BookMetadataProfile
> = {
	general: {
		profile: { id: "general", version: BOOK_METADATA_PROFILE_VERSION },
		primary: "googlebooks",
		order: [
			"googlebooks",
			"amazon",
			"openlibrary",
			"hardcover",
			"goodreads",
			"comicvine",
		],
		fields: {
			subtitle: ["googlebooks"],
			description: ["googlebooks"],
			languageCode: ["googlebooks"],
			authors: ["googlebooks"],
			publisher: ["googlebooks"],
			series: ["googlebooks"],
			genres: ["googlebooks"],
			cover: ["googlebooks", "amazon", "openlibrary", "hardcover"],
			rating: ["amazon"],
			ratingCount: ["amazon"],
		},
	},
	light_novels: {
		profile: { id: "light_novels", version: BOOK_METADATA_PROFILE_VERSION },
		primary: "ranobedb",
		order: ["ranobedb", "googlebooks", "amazon"],
		// Linguistic and structural identity remains under RanobeDB's authority.
		// Supplemental sources only fill objective/display fields.
		fields: {
			titleRomaji: ["ranobedb"],
			description: ["ranobedb"],
			authors: ["ranobedb"],
			publisher: ["ranobedb"],
			series: ["ranobedb"],
			genres: ["ranobedb"],
			tags: ["ranobedb"],
			subtitle: ["googlebooks"],
			languageCode: ["googlebooks"],
			cover: ["googlebooks", "amazon"],
			rating: ["amazon"],
			ratingCount: ["amazon"],
		},
	},
};

export function isBookMetadataProfileId(
	value: string,
): value is BookMetadataProfileId {
	return (BOOK_METADATA_PROFILE_IDS as readonly string[]).includes(value);
}

/** Returns a detached config so UI/service callers can safely customize it. */
export function bookMetadataProfile(
	id: BookMetadataProfileId,
): BookMetadataProfile {
	const profile = BOOK_METADATA_PROFILES[id];
	return {
		...profile,
		profile: { ...profile.profile },
		order: [...profile.order],
		fields: profile.fields
			? Object.fromEntries(
					Object.entries(profile.fields).flatMap(([field, providers]) =>
						providers ? [[field, [...providers]]] : [],
					),
				)
			: undefined,
	};
}
