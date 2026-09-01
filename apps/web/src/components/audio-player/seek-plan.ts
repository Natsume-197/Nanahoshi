/** HTMLMediaElement.HAVE_METADATA — inlined so this stays testable without a DOM. */
const HAVE_METADATA = 1;

export interface SeekPlanInput {
	/** Target position in global (whole-book) seconds. */
	time: number;
	/** Global start offset of each audio file, in file order. */
	offsets: number[];
	/** Total duration across all files (multi-file books). */
	totalDuration: number;
	fileCount: number;
	currentFileIndex: number;
	/** `audio.readyState` of the media element. */
	readyState: number;
	/** `audio.duration` (may be NaN before metadata loads). */
	mediaDuration: number;
	/** Duration from book metadata, single-file fallback ceiling. */
	bookDuration: number | null;
}

export interface SeekPlan {
	fileIndex: number;
	/** Position within the target file, clamped. */
	fileTime: number;
	/** The target lives in a different file — the element needs a new src. */
	srcSwap: boolean;
	/**
	 * The media can't accept the seek yet (fresh src, or metadata not loaded).
	 * Setting `currentTime` now would only record a "default start position"
	 * that a paused player never applies — the caller must stash the position
	 * and flush it on loadedmetadata instead.
	 */
	deferred: boolean;
}

/** Resolve a global seek target to a concrete file + position + apply strategy. */
export function planSeek(input: SeekPlanInput): SeekPlan {
	const single = input.fileCount <= 1;
	let fileIndex = 0;
	let fileTime: number;

	if (single) {
		const max =
			Number.isFinite(input.mediaDuration) && input.mediaDuration > 0
				? input.mediaDuration
				: (input.bookDuration ?? Number.POSITIVE_INFINITY);
		fileTime = Math.max(0, Math.min(input.time, max));
	} else {
		const clamped = Math.max(0, Math.min(input.time, input.totalDuration));
		for (let i = input.offsets.length - 1; i >= 0; i--) {
			if (clamped >= input.offsets[i]) {
				fileIndex = i;
				break;
			}
		}
		fileTime = clamped - (input.offsets[fileIndex] ?? 0);
	}

	const srcSwap = !single && fileIndex !== input.currentFileIndex;
	return {
		fileIndex,
		fileTime,
		srcSwap,
		deferred: srcSwap || input.readyState < HAVE_METADATA,
	};
}

/**
 * Whether a seek the media couldn't accept yet may be applied now. Checked on
 * every readiness event, not just `loadedmetadata`: a deferred seek that missed
 * that single event would otherwise strand playback at the old position while
 * the UI shows the new one.
 */
export function shouldFlushPendingSeek(
	pending: number | null,
	readyState: number,
): pending is number {
	return pending != null && readyState >= HAVE_METADATA;
}

/**
 * A currentTime assignment is only a request. Some browsers expose the value
 * briefly after metadata loads, then reset the playhead while the stream becomes
 * seekable. Keep the request pending until a media progress event acknowledges
 * a position close to the target.
 */
export function shouldConfirmPendingSeek(
	pending: number,
	actualTime: number,
	toleranceSeconds = 0.75,
): boolean {
	return (
		Number.isFinite(actualTime) &&
		Math.abs(actualTime - pending) <= toleranceSeconds
	);
}

/** Use the requested playhead for persistence while the media catches up. */
export function effectiveMediaTime(
	actualTime: number,
	pendingTime: number | null,
): number {
	return pendingTime ?? actualTime;
}

/**
 * Whether a saved position that just arrived may still be applied. A seek made
 * while the fetch was in flight wins — restoring progress must never yank the
 * user back from where they went.
 */
export function shouldApplyRestoredPosition(opts: {
	userSeeked: boolean;
	savedSeconds: number | null | undefined;
}): boolean {
	if (opts.userSeeked) return false;
	return opts.savedSeconds != null && opts.savedSeconds > 0;
}

/**
 * Fraction (0–1) of a horizontal track the pointer sits over, for the hover
 * fill and time tooltip. Null when the track has no width (not laid out yet).
 */
export function hoverFraction(
	clientX: number,
	rect: { left: number; width: number },
): number | null {
	if (rect.width === 0) return null;
	const pct = (clientX - rect.left) / rect.width;
	return Math.min(1, Math.max(0, pct));
}
