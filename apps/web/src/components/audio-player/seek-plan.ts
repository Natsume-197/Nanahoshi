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
