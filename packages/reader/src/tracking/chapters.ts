export interface BookChapter {
	title: string | null;
	start: number;
}

/**
 * The reader's table of contents as book fractions. Only labelled top-level
 * sections count, so covers and title pages do not become "Chapter 1".
 */
export function readerChapters(
	sections: {
		label?: string;
		startCharacter?: number;
		parentChapter?: string;
	}[],
	totalCharacters: number,
): BookChapter[] | null {
	if (totalCharacters <= 0) return null;
	const chapters = sections
		.filter(
			(s) => s.label && !s.parentChapter && s.startCharacter !== undefined,
		)
		.map((s) => ({
			title: s.label?.trim().slice(0, 300) || null,
			start: Math.min(
				1,
				Math.max(0, (s.startCharacter ?? 0) / totalCharacters),
			),
		}))
		.sort((a, b) => a.start - b.start)
		.slice(0, 500);
	// Cover, title page and contents are listed too; tiny leading entries are not chapters.
	while (
		chapters.length > 1 &&
		(chapters[1]?.start ?? 1) - (chapters[0]?.start ?? 0) < 0.01
	)
		chapters.shift();
	return chapters.length ? chapters : null;
}
