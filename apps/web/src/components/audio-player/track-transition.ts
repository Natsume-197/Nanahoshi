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
