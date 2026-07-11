/** MediaError.MEDIA_ERR_ABORTED — inlined so this stays testable without a DOM. */
const MEDIA_ERR_ABORTED = 1;

/**
 * Whether an `<audio>` error event is worth surfacing to the user. Fired errors
 * are not all real failures: swapping `src` (multi-file jumps, switching books)
 * and stop() clearing the source both raise benign errors we must swallow so we
 * don't flash a spurious "playback failed" toast.
 */
export function isReportableMediaError(audio: {
	currentSrc: string;
	error: { code: number } | null;
}): boolean {
	// stop() removes the src, leaving no current source — nothing failed.
	if (!audio.currentSrc) return false;
	// An aborted load is a src swap we triggered, not a stream/decode failure.
	if (audio.error?.code === MEDIA_ERR_ABORTED) return false;
	return true;
}
