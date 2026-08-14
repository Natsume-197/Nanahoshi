import { READER_POSITION_VERSION, type ReaderBookmark } from "./types";

const keyFor = (uuid: string) => `nanahoshi-reader-position:${uuid}`;

/** Last live reading position, kept separate from the user's manual marker. */
export function loadLocalReadingPosition(
	uuid: string,
): ReaderBookmark | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		const raw = window.localStorage.getItem(keyFor(uuid));
		return raw ? (JSON.parse(raw) as ReaderBookmark) : undefined;
	} catch {
		return undefined;
	}
}

export function saveLocalReadingPosition(
	uuid: string,
	position: ReaderBookmark,
): ReaderBookmark {
	const previous = loadLocalReadingPosition(uuid);
	if (
		previous?.exploredCharCount === position.exploredCharCount &&
		previous.lastBookmarkModified >= position.lastBookmarkModified
	) {
		return previous;
	}
	const savedPosition = {
		...position,
		lastBookmarkModified: Math.max(
			position.lastBookmarkModified,
			(previous?.lastBookmarkModified ?? -1) + 1,
		),
		positionVersion: READER_POSITION_VERSION,
	};
	try {
		window.localStorage.setItem(keyFor(uuid), JSON.stringify(savedPosition));
	} catch {
		// no-op (private mode, quota...)
	}
	return savedPosition;
}
