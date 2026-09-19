/**
 * A normal reader is focused on its own publication; only an explicit
 * Read & Listen session may bring the persistent audiobook player into it.
 */
export function isPlayerHiddenRoute(
	pathname: string,
	readListenActive = false,
): boolean {
	return (
		(pathname.startsWith("/reader/") && !readListenActive) ||
		/^\/(?:dashboard\/(?:settings|server)|login|sign-up)(?:\/|$)/.test(pathname)
	);
}

export function shouldReserveReaderPlayerSpace(
	readListenActive: boolean,
	audiobookLoaded: boolean,
): boolean {
	return readListenActive && audiobookLoaded;
}
