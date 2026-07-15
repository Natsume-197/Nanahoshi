import type { ReaderPosition } from "@lostcoords/lumi-reader-core";
import { isPersistedReaderPosition } from "./position-store";

/** localStorage key for a book's manual bookmark. */
const key = (uuid: string) => `nanahoshi-lumi-bookmark:${uuid}`;

/** Read the manual bookmark for a book, or null if absent/invalid. */
export function getBookmark(uuid: string): ReaderPosition | null {
	try {
		const raw = localStorage.getItem(key(uuid));
		if (!raw) return null;
		const bookmark: unknown = JSON.parse(raw);
		return isPersistedReaderPosition(bookmark) ? bookmark : null;
	} catch {
		return null;
	}
}

/** Persist the manual bookmark for a book. */
export function setBookmark(uuid: string, position: ReaderPosition): void {
	try {
		localStorage.setItem(key(uuid), JSON.stringify(position));
	} catch {}
}
