export const QUERY_PERSIST_KEY = "nanahoshi-query-cache";

/**
 * Query key of the offline-books list. Lives here (not in use-cached-books)
 * because utils/orpc.ts needs it at boot, and the hook module drags the reader
 * IndexedDB stack (Dexie) into the entry bundle.
 */
export const CACHED_BOOKS_QUERY_KEY = ["reader-cached-books"];

/** Sign-out cleanup. The IndexedDB book cache is deliberately kept. */
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
