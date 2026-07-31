/**
 * The maths behind dragging the expanded player down to dismiss it. Velocities
 * are px/ms (what pointer events hand us); positive is downwards.
 */

/** Movement before a touch is read as a drag rather than a tap. */
export const DRAG_THRESHOLD_PX = 8;

/** Scroll deceleration from Apple's "Designing Fluid Interfaces". */
const DECELERATION = 0.998;

/** Share of the panel the throw has to reach for the dismissal to commit. */
const DISMISS_FRACTION = 0.35;

/** How far a drag past the top can pull the sheet, however hard it's yanked. */
const RUBBER_BAND_LIMIT_PX = 72;

const MIN_RELEASE_MS = 160;
const MAX_RELEASE_MS = 420;
/** Used when the finger was still at release and there's no speed to inherit. */
const RESTING_RELEASE_MS = 280;

/** Where momentum would carry the sheet after the finger leaves it. */
export function projectMomentum(velocity: number): number {
	return (velocity * DECELERATION) / (1 - DECELERATION);
}

/** Progressive resistance past a boundary, approaching `limit` but never reaching it. */
export function rubberBand(
	overshoot: number,
	limit = RUBBER_BAND_LIMIT_PX,
): number {
	return (limit * overshoot) / (limit + overshoot);
}

/** Where the panel sits for a given finger travel, resisting above the top. */
export function sheetOffset(travel: number): number {
	return travel >= 0 ? travel : -rubberBand(-travel);
}

/**
 * Whether the release dismisses. Projecting the throw covers both a slow drag
 * past the halfway mark and a fast flick from near the top; an upward flick
 * projects backwards, so it snaps home however far down the sheet had got.
 */
export function shouldDismissSheet(
	offset: number,
	velocity: number,
	height: number,
): boolean {
	return offset + projectMomentum(velocity) > height * DISMISS_FRACTION;
}

/** Settle time, so the animation leaves the finger at the speed it had. */
export function releaseDuration(distance: number, velocity: number): number {
	const speed = Math.abs(velocity);
	if (speed < 0.01) return RESTING_RELEASE_MS;
	return Math.min(
		MAX_RELEASE_MS,
		Math.max(MIN_RELEASE_MS, Math.abs(distance) / speed),
	);
}

/** Weighted towards the newest sample, so a late flick still registers. */
export function blendVelocity(previous: number, sample: number): number {
	return previous * 0.3 + sample * 0.7;
}
