import { t } from "@/lib/i18n";
import { activeChapterIndex, type Chapter } from "./timing";

export function chapterName(chapter: Chapter | undefined, index: number) {
	return (
		chapter?.title ?? t("audiobook.chapter_fallback", { number: index + 1 })
	);
}

/** The name of the chapter playing at `time`, or null before the first. */
export function chapterNameAt(chapters: Chapter[], time: number) {
	const index = activeChapterIndex(chapters, time);
	return index >= 0 ? chapterName(chapters[index], index) : null;
}
