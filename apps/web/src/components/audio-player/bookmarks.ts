import { useSyncExternalStore } from "react";

export interface AudioBookmark {
	id: string;
	/** Global position in seconds. */
	time: number;
	label: string;
	createdAt: number;
}

const MAX_BOOKMARKS_PER_BOOK = 100;

function keyForBook(uuid: string): string {
	return `audio-bookmarks:${uuid}`;
}

function readRaw(uuid: string): AudioBookmark[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(keyForBook(uuid));
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(b): b is AudioBookmark =>
					typeof b === "object" &&
					b !== null &&
					typeof (b as AudioBookmark).id === "string" &&
					Number.isFinite((b as AudioBookmark).time) &&
					typeof (b as AudioBookmark).label === "string",
			)
			.map((b) => ({
				id: b.id,
				time: Math.max(0, b.time),
				label: b.label.slice(0, 140),
				createdAt:
					Number.isFinite(b.createdAt) && (b.createdAt as number) > 0
						? (b.createdAt as number)
						: Date.now(),
			}))
			.sort((a, b) => a.time - b.time);
	} catch {
		return [];
	}
}

function writeRaw(uuid: string, bookmarks: AudioBookmark[]) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(keyForBook(uuid), JSON.stringify(bookmarks));
	} catch {
		// Private-mode quota errors must not break playback.
	}
}

function newId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
	}
}

export function listBookmarks(uuid: string | null): AudioBookmark[] {
	if (!uuid) return [];
	return readRaw(uuid);
}

/** Nearest bookmark within `thresholdSeconds` of `time`, or null. */
export function findBookmarkNear(
	bookmarks: readonly AudioBookmark[],
	time: number,
	thresholdSeconds: number,
): AudioBookmark | null {
	let best: AudioBookmark | null = null;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const bookmark of bookmarks) {
		const dist = Math.abs(bookmark.time - time);
		if (dist <= thresholdSeconds && dist < bestDist) {
			best = bookmark;
			bestDist = dist;
		}
	}
	return best;
}

// --- Reactive layer ------------------------------------------------------
// Mutations below notify subscribers so markers and lists re-render in the
// same tick the bookmark changes (a memo/useMemo keyed on uuid alone would
// stay stale until the book changes). Cross-tab edits arrive via the
// `storage` event and bump the same version.

type BookmarksListener = () => void;

const listeners = new Set<BookmarksListener>();
let version = 0;
let storageHooked = false;

function ensureStorageHook() {
	if (
		storageHooked ||
		typeof window === "undefined" ||
		typeof window.addEventListener !== "function"
	)
		return;
	storageHooked = true;
	window.addEventListener("storage", (event) => {
		if (event.key?.startsWith("audio-bookmarks:")) bumpBookmarksVersion();
	});
}

function bumpBookmarksVersion() {
	version += 1;
	for (const listener of listeners) listener();
}

export function subscribeBookmarks(listener: BookmarksListener): () => void {
	ensureStorageHook();
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getBookmarksVersion(): number {
	return version;
}

// useSyncExternalStore requires a referentially stable snapshot: without the
// cache every getSnapshot call would return a fresh array and loop forever.
let snapshotCache: {
	uuid: string | null;
	version: number;
	list: AudioBookmark[];
} | null = null;

function readSnapshot(uuid: string | null): AudioBookmark[] {
	const current = getBookmarksVersion();
	if (
		snapshotCache &&
		snapshotCache.uuid === uuid &&
		snapshotCache.version === current
	) {
		return snapshotCache.list;
	}
	const list = listBookmarks(uuid);
	snapshotCache = { uuid, version: current, list };
	return list;
}

export function addBookmark(
	uuid: string,
	time: number,
	label?: string,
): AudioBookmark[] {
	const bookmarks = readRaw(uuid);
	const bookmark: AudioBookmark = {
		id: newId(),
		time: Math.max(0, Math.floor(time)),
		label: (label ?? "").slice(0, 140),
		createdAt: Date.now(),
	};
	const next = [...bookmarks, bookmark]
		.sort((a, b) => a.time - b.time)
		.slice(-MAX_BOOKMARKS_PER_BOOK);
	writeRaw(uuid, next);
	bumpBookmarksVersion();
	return next;
}

export function removeBookmark(uuid: string, id: string): AudioBookmark[] {
	const next = readRaw(uuid).filter((b) => b.id !== id);
	writeRaw(uuid, next);
	bumpBookmarksVersion();
	return next;
}

export function renameBookmark(
	uuid: string,
	id: string,
	label: string,
): AudioBookmark[] {
	const next = readRaw(uuid).map((b) =>
		b.id === id ? { ...b, label: label.slice(0, 140) } : b,
	);
	writeRaw(uuid, next);
	bumpBookmarksVersion();
	return next;
}

/**
 * Live bookmark list for a book. Re-renders on every local mutation and on
 * cross-tab `storage` edits — the single source of truth for markers, the
 * panel and the popover, so none of them can go stale.
 */
export function useBookmarks(uuid: string | null): AudioBookmark[] {
	return useSyncExternalStore(
		subscribeBookmarks,
		() => readSnapshot(uuid),
		() => EMPTY_BOOKMARKS,
	);
}

const EMPTY_BOOKMARKS: AudioBookmark[] = [];
