// The tray is live: the gateway pushes a "tray changed" event whenever the
// worker or another user moves a row, and the page refetches on it. This slow
// poll is only a safety net for a dropped socket.
export const FALLBACK_POLL_MS = 60_000;

/**
 * Rows to show while the user is working on the list (a selection or an open
 * detail). Live data keeps flowing — chips and counts stay current — but the
 * order is pinned to what was on screen when the work started, so nothing
 * moves under the cursor. A row that left the filter keeps its last known
 * state until the user lets go; new rows wait until then too.
 */
export function pinRowOrder<T>(
	order: readonly string[],
	live: readonly T[],
	lastKnown: ReadonlyMap<string, T>,
	keyOf: (row: T) => string,
): T[] {
	const liveByKey = new Map(live.map((row) => [keyOf(row), row]));
	return order.flatMap((key) => {
		const row = liveByKey.get(key) ?? lastKnown.get(key);
		return row ? [row] : [];
	});
}
