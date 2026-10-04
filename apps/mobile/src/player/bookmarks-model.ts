/** Audiobook bookmarks, the same local-first shape as the web's
 * (components/audio-player/bookmarks.ts): a moment in the book and a note. */
export type AudioBookmark = {
	id: string;
	/** Position in the whole book, in seconds. */
	time: number;
	label: string;
	createdAt: number;
};

export const MAX_BOOKMARKS = 100;
export const MAX_LABEL = 140;

/** Whatever was on disk, reduced to valid bookmarks in book order. */
export function parseBookmarks(
	raw: unknown,
	now = Date.now(),
): AudioBookmark[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(item): item is AudioBookmark =>
				typeof item === "object" &&
				item !== null &&
				typeof item.id === "string" &&
				Number.isFinite(item.time) &&
				typeof item.label === "string",
		)
		.map((item) => ({
			id: item.id,
			time: Math.max(0, item.time),
			label: item.label.slice(0, MAX_LABEL),
			createdAt:
				Number.isFinite(item.createdAt) && item.createdAt > 0
					? item.createdAt
					: now,
		}))
		.sort((a, b) => a.time - b.time);
}

/** Adds the bookmark in book order; a second one on the same second (a
 * repeated tap) is dropped. */
export function withBookmark(
	list: readonly AudioBookmark[],
	bookmark: AudioBookmark,
): AudioBookmark[] {
	if (list.some((item) => item.time === bookmark.time)) return [...list];
	return [...list, bookmark]
		.sort((a, b) => a.time - b.time)
		.slice(-MAX_BOOKMARKS);
}

export function newBookmark(
	time: number,
	id: string,
	now = Date.now(),
): AudioBookmark {
	return { id, time: Math.max(0, Math.floor(time)), label: "", createdAt: now };
}

/** Nearest bookmark within `threshold` seconds of `time`, or null. */
export function findBookmarkNear(
	list: readonly AudioBookmark[],
	time: number,
	threshold: number,
): AudioBookmark | null {
	let best: AudioBookmark | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const bookmark of list) {
		const distance = Math.abs(bookmark.time - time);
		if (distance <= threshold && distance < bestDistance) {
			best = bookmark;
			bestDistance = distance;
		}
	}
	return best;
}
