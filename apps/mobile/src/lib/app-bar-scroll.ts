/**
 * Material 3's "enter always" top app bar: it slides away by exactly as much
 * as the content scrolls down and comes back as soon as it scrolls up, never
 * past fully shown or fully hidden. At the very top it is always shown.
 * Returns the bar's translateY (0 shown … -height hidden).
 */
export function nextAppBarOffset(
	offset: number,
	previousY: number,
	y: number,
	height: number,
): number {
	"worklet";
	if (y <= 0) return 0;
	return Math.min(0, Math.max(-height, offset - (y - previousY)));
}

/** When the finger lets go half-way, finish the motion to the nearer end —
 * except near the top, where hiding would leave a gap above the content. */
export function settleAppBarOffset(
	offset: number,
	y: number,
	height: number,
): number {
	"worklet";
	if (y < height) return 0;
	return offset < -height / 2 ? -height : 0;
}

/** A sticky row's top on screen: it rides with the content until it meets
 * `pinTop` (the bottom of whatever bar sits above it), then stays there. */
export function pinnedRowTop(
	anchorY: number,
	scrollY: number,
	pinTop: number,
): number {
	"worklet";
	return Math.max(pinTop, anchorY - scrollY);
}
