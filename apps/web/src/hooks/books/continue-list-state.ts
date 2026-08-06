export type ContinueProgressData = { status?: string | null } | null;

/**
 * Whether the "remove from continue reading/listening" action applies to a book.
 * While the per-book progress query is still in flight (`undefined` data), the
 * rail that opened the menu is trusted: the item is there on the first frame
 * instead of the menu re-laying itself out once the fetch lands. A loaded `null`
 * means the server has no progress row, which is an answer, not a hint.
 */
export function resolveIsInContinueList({
	progress,
	isAudiobook,
	hint = false,
}: {
	progress: ContinueProgressData | undefined;
	isAudiobook: boolean;
	hint?: boolean;
}): boolean {
	if (progress === undefined) return hint;
	return progress?.status === (isAudiobook ? "listening" : "reading");
}
