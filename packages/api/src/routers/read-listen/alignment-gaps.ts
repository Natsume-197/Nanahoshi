import type { ReadListenCue } from "@nanahoshi/read-listen/manifest";

/**
 * Narrated illustrations and chapter breaks leave up to ~2.5 min without a
 * sentence; an aligner that drops a text section leaves far more.
 */
export const INCOMPLETE_ALIGNMENT_GAP_MS = 5 * 60_000;

type TimedCue = Pick<ReadListenCue, "audioFileIndex" | "startMs" | "endMs">;

/**
 * Longest stretch of audio between two aligned sentences of the same file.
 * Intros and credits sit before the first or after the last sentence, so
 * they never count.
 */
export function longestAlignmentGapMs(cues: readonly TimedCue[]): number {
	const sorted = [...cues].sort(
		(left, right) =>
			left.audioFileIndex - right.audioFileIndex ||
			left.startMs - right.startMs,
	);
	let longest = 0;
	let reachedMs = 0;
	for (const [index, cue] of sorted.entries()) {
		const previous = sorted[index - 1];
		if (previous?.audioFileIndex !== cue.audioFileIndex) {
			reachedMs = cue.endMs;
			continue;
		}
		longest = Math.max(longest, cue.startMs - reachedMs);
		reachedMs = Math.max(reachedMs, cue.endMs);
	}
	return longest;
}

export function isAlignmentIncomplete(longestGapMs: number | null): boolean {
	return longestGapMs !== null && longestGapMs > INCOMPLETE_ALIGNMENT_GAP_MS;
}
