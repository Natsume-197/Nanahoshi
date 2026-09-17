export function nextTrackPosition({
	currentFileIndex,
	audioFileCount,
}: {
	currentFileIndex: number;
	audioFileCount: number;
}): { fileIndex: number; currentTime: 0 } | null {
	const fileIndex = currentFileIndex + 1;
	return fileIndex < audioFileCount ? { fileIndex, currentTime: 0 } : null;
}

/**
 * Next book in an already-ordered series listing (`listBySeries` returns the
 * canonical order, so the frontend must not re-sort). Returns null at the end
 * of the series or when the current book is not in the list.
 */
export function findNextInSeries<T extends { uuid: string }>({
	currentUuid,
	seriesBooks,
}: {
	currentUuid: string;
	seriesBooks: readonly T[];
}): T | null {
	const index = seriesBooks.findIndex((b) => b.uuid === currentUuid);
	if (index < 0 || index + 1 >= seriesBooks.length) return null;
	return seriesBooks[index + 1];
}
