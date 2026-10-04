/**
 * Avatars and profile headers are stored as absolute URLs on the server's own
 * SERVER_URL origin (often http://localhost:7333), which a phone on the LAN
 * can't reach. Keep the path and put it on the origin the app connected to.
 * Headers also come as a 3000w original; the phone takes the 1500w variant.
 */
export function mediaUrl(
	serverUrl: string,
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	if (value.startsWith("data:")) return value;
	const path =
		/^https?:\/\/[^/]+(\/.*)$/.exec(value)?.[1] ??
		(value.startsWith("/") ? value : `/${value}`);
	const resized = path.replace(
		/-(\d+)w(\.(?:avif|webp))/,
		(match, width: string, ext: string) =>
			Number(width) > 1500 ? `-1500w${ext}` : match,
	);
	return path.startsWith("/api/data/")
		? `${serverUrl}${resized}`
		: /^https?:/.test(value)
			? value
			: `${serverUrl}${path}`;
}
