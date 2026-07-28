// Poll cadence for the match manager: brisk while books are actually being
// enriched, slow otherwise so a scan started elsewhere still shows up on its
// own, and off entirely while the user is engaged with a row so nothing moves
// under them mid-action. The default sort is "recent", so a poll reorders the
// list in place — pending selections and an open detail pane both count as
// engagement.
export const ACTIVE_POLL_MS = 5_000;
export const IDLE_POLL_MS = 30_000;

export function resolvePollInterval({
	selectionActive,
	detailOpen,
	inProgressCount,
}: {
	selectionActive: boolean;
	detailOpen: boolean;
	inProgressCount: number | undefined;
}): number | false {
	if (selectionActive || detailOpen) return false;
	if (inProgressCount == null) return IDLE_POLL_MS;
	return inProgressCount > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}
