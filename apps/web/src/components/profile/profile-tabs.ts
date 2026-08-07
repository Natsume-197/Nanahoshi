export type ProfileTab = "overview" | "books" | "audiobooks" | "likes";

/** The tabs a URL can name. Overview is the default, so it has no value. */
export const REQUESTED_PROFILE_TABS = ["books", "audiobooks", "likes"] as const;

export type RequestedProfileTab =
	| (typeof REQUESTED_PROFILE_TABS)[number]
	| undefined;

export type LikedFormat = "books" | "audiobooks";

export function parseRequestedProfileTab(value: unknown): RequestedProfileTab {
	return REQUESTED_PROFILE_TABS.includes(
		value as (typeof REQUESTED_PROFILE_TABS)[number],
	)
		? (value as (typeof REQUESTED_PROFILE_TABS)[number])
		: undefined;
}

/**
 * Which tab the profile renders. Likes are private — `likedBooks.listLiked`
 * only ever answers for the session user — so `?tab=likes` on someone else's
 * profile falls back to the overview rather than showing the viewer their own
 * likes under another name.
 */
export function resolveProfileTab({
	requestedTab,
	isOwnProfile,
}: {
	requestedTab: RequestedProfileTab;
	isOwnProfile: boolean;
}): ProfileTab {
	if (requestedTab === undefined) return "overview";
	if (requestedTab === "likes" && !isOwnProfile) return "overview";
	return requestedTab;
}
