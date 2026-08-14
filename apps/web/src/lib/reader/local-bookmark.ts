import { READER_POSITION_VERSION, type ReaderBookmark } from "./types";

// The manual marker is independent from the automatic last-reading position;
// changing resume behavior must never move or overwrite this marker.
const keyFor = (uuid: string) => `nanahoshi-reader-bookmark:${uuid}`;

export function loadLocalBookmark(uuid: string): ReaderBookmark | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		const raw = window.localStorage.getItem(keyFor(uuid));
		return raw ? (JSON.parse(raw) as ReaderBookmark) : undefined;
	} catch {
		return undefined;
	}
}

export function saveLocalBookmark(
	uuid: string,
	bookmark: ReaderBookmark,
): ReaderBookmark {
	const previous = loadLocalBookmark(uuid);
	const savedBookmark = {
		...bookmark,
		lastBookmarkModified: Math.max(
			bookmark.lastBookmarkModified,
			(previous?.lastBookmarkModified ?? -1) + 1,
		),
		positionVersion: READER_POSITION_VERSION,
	};
	try {
		window.localStorage.setItem(keyFor(uuid), JSON.stringify(savedBookmark));
	} catch {
		// no-op
	}
	return savedBookmark;
}
