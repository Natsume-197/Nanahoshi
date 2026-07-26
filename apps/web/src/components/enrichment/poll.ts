// Poll cadence for the match manager: brisk while books are actually being
// enriched, slow otherwise so a scan started elsewhere still shows up on its
// own, and off entirely while a selection is pending so rows never move under
// the user mid-action.
export const ACTIVE_POLL_MS = 5_000;
export const IDLE_POLL_MS = 30_000;

export function resolvePollInterval({
	selectionActive,
	inProgressCount,
}: {
	selectionActive: boolean;
	inProgressCount: number | undefined;
}): number | false {
	if (selectionActive) return false;
	if (inProgressCount == null) return IDLE_POLL_MS;
	return inProgressCount > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}
