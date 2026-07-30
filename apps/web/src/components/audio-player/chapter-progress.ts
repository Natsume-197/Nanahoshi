export type ProgressScope = "book" | "chapter";

export interface ProgressReadout {
	/** Absolute seconds the scope starts and ends at. */
	start: number;
	end: number;
	elapsed: number;
	remaining: number;
	total: number;
	fraction: number;
}

/**
 * The single derivation of "where are we" for both the readout and the scrub
 * track, in book scope or narrowed to the playing chapter.
 */
export function getProgressReadout(
	scope: ProgressScope,
	input: {
		globalTime: number;
		totalDuration: number;
		chapter: { startTime: number; endTime: number } | undefined;
	},
): ProgressReadout {
	const useChapter = scope === "chapter" && input.chapter != null;
	const start = useChapter ? (input.chapter?.startTime ?? 0) : 0;
	const end = useChapter ? (input.chapter?.endTime ?? 0) : input.totalDuration;
	const total = Math.max(0, end - start);
	const elapsed = Math.max(0, Math.min(total, input.globalTime - start));
	return {
		start,
		end,
		elapsed,
		remaining: Math.max(0, total - elapsed),
		total,
		fraction: total > 0 ? elapsed / total : 0,
	};
}

/** Wall-clock seconds a stretch of book takes at the current rate. */
export function realTimeAt(seconds: number, speed: number): number {
	return seconds / Math.max(0.1, speed);
}
