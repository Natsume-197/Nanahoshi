/** Index of the chapter that contains `time` (global seconds), or -1 if none. */
export function getActiveChapterIndex(
	chapters: { startTime: number }[],
	time: number,
): number {
	for (let i = chapters.length - 1; i >= 0; i--) {
		if (time >= (chapters[i]?.startTime ?? 0)) return i;
	}
	return -1;
}

/** Chapter start positions as track percentages (0–100), excluding the ends. */
export function getChapterMarkerPercents(
	chapters: { startTime: number }[],
	totalDuration: number,
): number[] {
	if (totalDuration <= 0) return [];
	return chapters
		.map((c) => (c.startTime / totalDuration) * 100)
		.filter((pct) => pct > 0 && pct < 100);
}
