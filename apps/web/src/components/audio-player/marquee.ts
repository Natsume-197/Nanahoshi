/** Below this, the slide draws more attention than the ellipsis it replaces. */
export const MIN_OVERFLOW_PX = 8;
export const MARQUEE_PX_PER_SECOND = 27;
export const MARQUEE_GAP_PX = 48;

export function shouldLoop(overflow: number): boolean {
	return overflow > MIN_OVERFLOW_PX;
}

export function marqueeVars(contentWidth: number): Record<string, string> {
	const distance = contentWidth + MARQUEE_GAP_PX;
	return {
		"--marquee-shift": `-${distance}px`,
		"--marquee-gap": `${MARQUEE_GAP_PX}px`,
		"--marquee-duration": `${distance / MARQUEE_PX_PER_SECOND}s`,
	};
}
