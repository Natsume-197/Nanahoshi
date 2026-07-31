/** Below this, the slide draws more attention than the ellipsis it replaces. */
export const MIN_OVERFLOW_PX = 8;
/** Reading pace of the slide, and the pause baked into each end of the sweep. */
const PX_PER_SECOND = 30;
const PAUSE_SECONDS = 4;

export function shouldSweep(overflow: number): boolean {
	return overflow > MIN_OVERFLOW_PX;
}

/** Distance and round-trip time, so every title moves at the same speed. */
export function marqueeVars(overflow: number): Record<string, string> {
	return {
		"--marquee-shift": `-${overflow}px`,
		"--marquee-duration": `${(overflow / PX_PER_SECOND) * 2 + PAUSE_SECONDS}s`,
	};
}
