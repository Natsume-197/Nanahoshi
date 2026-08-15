export const QUERY_PERSIST_KEY = "nanahoshi-query-cache";

/** Removes book copies created by the former offline reader. */
export function removeLegacyBookStorage(): void {
	if (!("indexedDB" in window)) return;
	try {
		window.indexedDB.deleteDatabase("NanahoshiReaderDB");
	} catch {
		// The browser can reject storage access in private mode.
	}
}

/** Sign-out cleanup for browser caches that do not contain book files. */
export async function clearOfflineCaches(): Promise<void> {
	try {
		window.localStorage.removeItem(QUERY_PERSIST_KEY);
	} catch {
		// no-op (private mode)
	}
	if (!("caches" in window)) return;
	const names = await window.caches.keys().catch(() => []);
	await Promise.all(
		names
			.filter((name) => name.startsWith("nanahoshi-"))
			.map((name) => window.caches.delete(name).catch(() => false)),
	);
}
