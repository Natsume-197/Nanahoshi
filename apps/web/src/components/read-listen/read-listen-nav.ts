import type { PairView } from "./read-listen-tray";

/** A bucket row opens the first of its states that has work in it. */
export function bucketLandingView(
	views: PairView[],
	counts: Partial<Record<PairView, number>>,
): PairView {
	return (
		views.find((view) => (counts[view] ?? 0) > 0) ?? (views[0] as PairView)
	);
}
