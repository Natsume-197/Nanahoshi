/** Removes browser storage left by retired offline features. */
export function removeLegacyOfflineStorage(): void {
	try {
		window.localStorage.removeItem("nanahoshi-query-cache");
		window.localStorage.removeItem("nanahoshi-active-server");
		window.localStorage.removeItem("nanahoshi-pending-progress");
	} catch {
		// Storage can be unavailable in private mode.
	}
	if ("indexedDB" in window) {
		try {
			window.indexedDB.deleteDatabase("NanahoshiReaderDB");
		} catch {
			// The browser can reject storage access in private mode.
		}
	}
}

/** Sign-out cleanup for every browser cache, including private reader files. */
export async function clearOfflineCaches(): Promise<void> {
	const readerCache = await import(
		"@/features/reader/document/reader-book-cache"
	);
	await readerCache.clearReaderBookCache();
	try {
		window.localStorage.removeItem("nanahoshi:recent-searches");
		window.localStorage.removeItem("kindle-email");
	} catch {
		// no-op (private mode)
	}
}
