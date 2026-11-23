/** The phone app's store listing, once it's public; until then the "don't
 * have the app?" help stays hidden rather than linking to a 404. Expected:
 * https://play.google.com/store/apps/details?id=app.nanahoshi.mobile */
export const PLAY_STORE_URL: string | null = null;

/** What the phone scans: the API origin it should connect to and the
 * single-use code it trades for a session of its own. */
export function pairAppLink(server: string, token: string) {
	return `nanahoshi://pair?${new URLSearchParams({ server, token })}`;
}

/** An origin only this computer can open; a phone would scan it in vain. */
export function isLoopbackOrigin(origin: string) {
	try {
		const { hostname } = new URL(origin);
		return (
			hostname === "localhost" ||
			hostname.endsWith(".localhost") ||
			hostname === "[::1]" ||
			/^127\./.test(hostname)
		);
	} catch {
		return false;
	}
}

/** "4:05" for the code's countdown. */
export function formatCountdown(ms: number) {
	const seconds = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
