/** Page direction (-1/0/1) for a wheel event, honoring vertical writing mode. */
export function pageDeltaForWheel(
	deltaX: number,
	deltaY: number,
	vertical: boolean,
): -1 | 0 | 1 {
	const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
	const delta = horizontal && vertical ? -deltaX : horizontal ? deltaX : deltaY;
	return delta > 0 ? 1 : delta < 0 ? -1 : 0;
}

/** Page direction (-1/0/1) for a swipe past `threshold`, honoring writing mode. */
export function pageDeltaForSwipe(
	deltaX: number,
	deltaY: number,
	vertical: boolean,
	threshold: number,
): -1 | 0 | 1 {
	const primary = vertical ? deltaY : deltaX;
	const cross = vertical ? deltaX : deltaY;
	if (Math.abs(primary) < threshold || Math.abs(primary) < Math.abs(cross))
		return 0;
	return primary < 0 ? 1 : -1;
}
