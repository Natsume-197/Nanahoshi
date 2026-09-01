export function resolveLiveListeningPosition({
	currentTimeSeconds,
	durationSeconds,
	updatedAt,
	playbackRate,
	receivedAt,
	now,
}: {
	currentTimeSeconds: number;
	durationSeconds: number;
	updatedAt: number;
	playbackRate?: number;
	/** Local receipt time for a gateway update. Avoids depending on clock skew. */
	receivedAt?: number;
	now: number;
}): number {
	const referenceTime = receivedAt ?? updatedAt;
	const elapsedSeconds = Math.max(
		0,
		Math.floor(((now - referenceTime) / 1000) * (playbackRate ?? 1)),
	);
	return Math.min(
		Math.max(0, durationSeconds),
		Math.max(0, currentTimeSeconds) + elapsedSeconds,
	);
}
