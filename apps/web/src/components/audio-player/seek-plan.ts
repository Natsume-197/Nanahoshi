/** HTMLMediaElement.HAVE_FUTURE_DATA — inlined so this stays testable without a DOM. */
const HAVE_FUTURE_DATA = 3;

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
	 * The media can't reliably accept the seek yet (fresh src, or not playable).
	 * Mobile browsers can reset a seek made at HAVE_METADATA back to zero, so the
	 * caller must stash the position and flush it on canplay instead.
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
		deferred: srcSwap || input.readyState < HAVE_FUTURE_DATA,
	};
}

/**
 * Whether a seek the media couldn't accept yet may be applied now. Checked on
 * every readiness event, not just `canplay`: a deferred seek that missed that
 * single event would otherwise strand playback at the old position while the
 * UI shows the new one.
 */
export function shouldFlushPendingSeek(
	pending: number | null,
	readyState: number,
): pending is number {
	return pending != null && readyState >= HAVE_FUTURE_DATA;
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
