/**
 * A stall shorter than this resolves before the user can read it, so surfacing
 * it would only flicker. Seeks over a fast connection land well inside it.
 */
export const BUFFERING_INDICATOR_DELAY_MS = 250;

export interface BufferingIndicator {
	/** Playback is waiting for data (`waiting`/`stalled`). */
	stall: () => void;
	/** Data arrived, or playback stopped mattering (`playing`, `pause`, …). */
	resume: () => void;
	/** Drop any armed timer — call when the media element goes away. */
	dispose: () => void;
}

/**
 * Debounces "waiting for data" into a flag the player can render. Only stalls
 * that outlast `delayMs` are ever shown, and `onChange` fires only on real
 * transitions, so the frequent readiness events don't re-render the player.
 */
export function createBufferingIndicator(
	onChange: (buffering: boolean) => void,
	delayMs: number = BUFFERING_INDICATOR_DELAY_MS,
): BufferingIndicator {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let shown = false;

	return {
		stall() {
			if (timer != null || shown) return;
			timer = setTimeout(() => {
				timer = null;
				shown = true;
				onChange(true);
			}, delayMs);
		},
		resume() {
			if (timer != null) {
				clearTimeout(timer);
				timer = null;
			}
			if (!shown) return;
			shown = false;
			onChange(false);
		},
		dispose() {
			if (timer != null) clearTimeout(timer);
			timer = null;
			shown = false;
		},
	};
}
