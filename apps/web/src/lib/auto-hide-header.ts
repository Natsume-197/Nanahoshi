/**
 * Below this offset the bar is always shown, so a page never opens with its
 * chrome missing and a short page can't get stuck without it.
 */
export const ALWAYS_SHOWN_ABOVE = 72;

/**
 * Minimum travel before a direction counts. Without it a rubber-band bounce or
 * a one-pixel jitter flickers the bar on every frame.
 */
export const DIRECTION_DELTA = 10;

export interface AutoHideState {
	/** Offset the last accepted direction was measured from. */
	lastY: number;
	hidden: boolean;
}

/**
 * Decides whether the bar should be hidden at scroll offset `y`. Pure so the
 * thresholds can be tested without a scroll container: the hook only wires this
 * to scroll events and writes the result to the DOM.
 *
 * Returns a new state; `lastY` deliberately does NOT advance for movement below
 * the delta, so slow drift accumulates into a direction instead of being
 * discarded frame by frame.
 */
export function resolveAutoHide(
	state: AutoHideState,
	y: number,
): AutoHideState {
	if (y <= ALWAYS_SHOWN_ABOVE) return { lastY: y, hidden: false };

	const delta = y - state.lastY;
	if (Math.abs(delta) < DIRECTION_DELTA) return state;

	return { lastY: y, hidden: delta > 0 };
}
