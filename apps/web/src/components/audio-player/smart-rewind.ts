/** Pause longer than this rewinds a few seconds on resume. */
export const SMART_REWIND_THRESHOLD_MS = 10 * 60 * 1000;
/** Very long pauses rewind a bit more. */
export const SMART_REWIND_LONG_PAUSE_MS = 60 * 60 * 1000;

export const SMART_REWIND_SECONDS = 10;
export const SMART_REWIND_LONG_SECONDS = 30;

/**
 * Seconds to rewind when resuming after `pausedMs`. Pure for testing; the
 * caller clamps against the playhead (never before zero).
 */
export function computeSmartRewind({
	pausedMs,
	currentTime,
}: {
	pausedMs: number;
	currentTime: number;
}): number {
	if (!Number.isFinite(pausedMs) || pausedMs < SMART_REWIND_THRESHOLD_MS) {
		return 0;
	}
	if (currentTime <= 0) return 0;
	const rewind =
		pausedMs >= SMART_REWIND_LONG_PAUSE_MS
			? SMART_REWIND_LONG_SECONDS
			: SMART_REWIND_SECONDS;
	return Math.min(rewind, Math.max(0, currentTime));
}
