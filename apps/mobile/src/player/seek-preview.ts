import { type AudioBookmark, findBookmarkNear } from "./bookmarks-model";
import { activeChapterIndex, type Chapter } from "./timing";

/** A fingertip covers ~1.5% of the bar; a bookmark that close is claimed. */
const BOOKMARK_REACH = 0.015;
const MIN_REACH_SECONDS = 3;

export type SeekPreview = {
	/** The bookmark under the finger and its 1-based place in the list. */
	bookmark: { id: string; number: number; label: string } | null;
	/** The chapter at that moment, -1 before the first. */
	chapterIndex: number;
};

/** What the scrub bubble names at `time` on a bar `span` seconds long. */
export function seekPreview(
	time: number,
	span: number,
	chapters: Chapter[],
	bookmarks: readonly AudioBookmark[],
): SeekPreview {
	const near = findBookmarkNear(
		bookmarks,
		time,
		Math.max(MIN_REACH_SECONDS, span * BOOKMARK_REACH),
	);
	return {
		bookmark: near
			? {
					id: near.id,
					number: bookmarks.indexOf(near) + 1,
					label: near.label,
				}
			: null,
		chapterIndex: activeChapterIndex(chapters, time),
	};
}
