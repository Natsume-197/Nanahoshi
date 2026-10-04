export type ProfileTab = "overview" | "books" | "audiobooks";

/** The tabs a URL can name. Overview is the default, so it has no value. */
export const REQUESTED_PROFILE_TABS = ["books", "audiobooks"] as const;

export type RequestedProfileTab =
	| (typeof REQUESTED_PROFILE_TABS)[number]
	| undefined;

export function parseRequestedProfileTab(value: unknown): RequestedProfileTab {
	return REQUESTED_PROFILE_TABS.includes(
		value as (typeof REQUESTED_PROFILE_TABS)[number],
	)
		? (value as (typeof REQUESTED_PROFILE_TABS)[number])
		: undefined;
}
