export const TAPS_TO_UNLOCK = 7;
/** Android starts counting down out loud after the third tap. */
export const ANNOUNCE_FROM = 3;
const RESET_AFTER_MS = 2000;

export type TapState = { count: number; last: number };

export const NO_TAPS: TapState = { count: 0, last: 0 };

/** Android's "tap the build number" unlock: taps only add up while they
 * come in quick succession. `remaining` reaches 0 on the unlocking tap. */
export function registerTap(state: TapState, now: number) {
	const count = now - state.last > RESET_AFTER_MS ? 1 : state.count + 1;
	return {
		state: { count, last: now },
		remaining: Math.max(TAPS_TO_UNLOCK - count, 0),
	};
}
