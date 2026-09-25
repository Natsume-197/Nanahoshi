import type { SectionWithProgress } from "@/features/reader/document/types";

export interface TocChapter extends SectionWithProgress {
	title: string;
}

/**
 * Top-level sections the table of contents lists. Unlabeled front matter
 * (cover, title page) is hidden when the book has a real TOC; a book without
 * one falls back to numbered sections so no entry is ever blank.
 */
export function tocChapters(
	sections: readonly SectionWithProgress[],
): TocChapter[] {
	const topLevel = sections.filter((section) => !section.parentChapter);
	if (topLevel.some((section) => section.label)) {
		return topLevel.flatMap((section) =>
			section.label ? [{ ...section, title: section.label }] : [],
		);
	}
	return topLevel.map((section, index) => ({
		...section,
		title: `Section ${index + 1}`,
	}));
}
