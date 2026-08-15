import { READER_POSITION_VERSION, type ReaderPosition } from "./types";

const keyFor = (uuid: string) => `nanahoshi-reader-position:${uuid}`;

type StoredPosition = ReaderPosition & { lastBookmarkModified?: number };

/** Last reading position, restored when the book is reopened. */
export function loadLocalReadingPosition(
	uuid: string,
): ReaderPosition | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		const raw = window.localStorage.getItem(keyFor(uuid));
		if (!raw) return undefined;
		const stored = JSON.parse(raw) as StoredPosition;
		return {
			...stored,
			modifiedAt: stored.modifiedAt ?? stored.lastBookmarkModified ?? 0,
		};
	} catch {
		return undefined;
	}
}

export function saveLocalReadingPosition(
	uuid: string,
	position: ReaderPosition,
): ReaderPosition {
	const previous = loadLocalReadingPosition(uuid);
	if (
		previous?.exploredCharCount === position.exploredCharCount &&
		previous.modifiedAt >= position.modifiedAt
	) {
		return previous;
	}
	const savedPosition = {
		...position,
		modifiedAt: Math.max(position.modifiedAt, (previous?.modifiedAt ?? -1) + 1),
		positionVersion: READER_POSITION_VERSION,
	};
	try {
		window.localStorage.setItem(keyFor(uuid), JSON.stringify(savedPosition));
	} catch {
		// no-op (private mode, quota...)
	}
	return savedPosition;
}
