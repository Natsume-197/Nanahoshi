/**
 * The round tab-bar avatar. The native image loader caches by URL with no
 * expiry, so `v` names the variant: a device that once got the square
 * original for this URL (a server from before the round variant answered
 * it with the plain file) asks again under a new key.
 */
export const TAB_AVATAR_VERSION = 2;

export function tabAvatarUrl(avatar: string | null): string | null {
	if (!avatar) return null;
	const join = avatar.includes("?") ? "&" : "?";
	return `${avatar}${join}format=png&shape=circle&v=${TAB_AVATAR_VERSION}`;
}

/** What a HEAD of the variant said: its content type, or that it failed. */
export type TabAvatarCheck =
	| { status: "pending" }
	| { status: "failed" }
	| { status: "answered"; contentType: string | null };

/**
 * Only a PNG is the round variant. A server that answers with anything else
 * (the plain avatar, from before the variant existed) would get a square
 * pinned in the native cache, so the tab keeps its glyph instead. Unchecked
 * (offline, still asking) the URL is used: the cache has what it had.
 */
export function usableTabAvatar(
	url: string | null,
	check: TabAvatarCheck,
): string | null {
	if (!url) return null;
	if (check.status !== "answered") return url;
	return check.contentType?.split(";")[0]?.trim().toLowerCase() === "image/png"
		? url
		: null;
}
