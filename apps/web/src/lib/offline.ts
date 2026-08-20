import { clearReaderBookCache } from "@/features/reader/document/reader-book-cache";
import {
	clearPendingProgressForOwner,
	setPendingProgressOwner,
} from "@/features/reader/session/pending-progress";

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

/** Sign-out cleanup for every browser cache, including private reader files. */
export async function clearOfflineCaches(): Promise<void> {
	clearPendingProgressForOwner();
	setPendingProgressOwner(null);
	await clearReaderBookCache();
	try {
		window.localStorage.removeItem(QUERY_PERSIST_KEY);
		window.localStorage.removeItem("nanahoshi:recent-searches");
		window.localStorage.removeItem("kindle-email");
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
