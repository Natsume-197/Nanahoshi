/**
 * Whole elapsed seconds between two timestamps. The caller must store `nowMs`
 * as the new "last sync" synchronously (before any await), so a second sync
 * fired in the same tick (visibilitychange → pagehide → unmount on close)
 * computes ~0 against the advanced baseline instead of re-sending — and
 * double-counting — this slice.
 *
 * Kept in its own client-free module so it is unit-testable without pulling in
 * the orpc client (whose env validation needs VITE_SERVER_URL).
 */
export function claimReadingTimeSlice(
	lastSyncMs: number,
	nowMs: number,
): number {
	return Math.floor((nowMs - lastSyncMs) / 1000);
}
