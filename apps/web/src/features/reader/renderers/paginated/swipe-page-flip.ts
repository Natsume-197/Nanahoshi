export const TOUCH_PAGE_FLIP_THRESHOLD = 40;

// Swipes follow the visual page order, not the internal scroll axis: tategaki
// pages stack vertically in the scroller but read right-to-left on screen.
export function swipePageFlipDirection(
	dx: number,
	dy: number,
	verticalMode: boolean,
): -1 | 1 | null {
	const absX = Math.abs(dx);
	if (absX < TOUCH_PAGE_FLIP_THRESHOLD || absX <= Math.abs(dy)) return null;
	if (verticalMode) return dx > 0 ? 1 : -1;
	return dx < 0 ? 1 : -1;
}
