/**
 * Viewport size in CSS pixels.
 *
 * `window.innerWidth/innerHeight` are unreliable on some HiDPI Linux/Chrome
 * setups, where they report physical pixels (e.g. innerHeight = clientHeight ×
 * devicePixelRatio) instead of CSS pixels. The reader measures layout in JS and
 * lays it out in CSS (`vh`/`dvh`, scroll offsets), so the two must agree —
 * `document.documentElement.clientWidth/clientHeight` are always CSS px and
 * match the CSS units, so we use those (falling back to `innerWidth/Height`
 * only if the document element isn't available).
 */
export function viewportWidth(win: Window = window): number {
	return win.document.documentElement.clientWidth || win.innerWidth;
}

export function viewportHeight(win: Window = window): number {
	return win.document.documentElement.clientHeight || win.innerHeight;
}

/**
 * Rendered height of a vertical-rl reading column — also the cap that keeps a
 * tall image from overflowing the column. The optional max-height setting only
 * applies in vertical mode; horizontal mode is always the full viewport height.
 */
export function readerColumnHeight(
	verticalMode: boolean,
	secondDimensionMaxValue: number,
): number {
	const vh = viewportHeight();
	return verticalMode && secondDimensionMaxValue
		? Math.min(secondDimensionMaxValue, vh)
		: vh;
}

/** CSS height for a fixed vertical reading column. Applying the optional cap
 * after the player-safe viewport keeps a small configured column unchanged. */
export function readerColumnHeightCss(
	viewportHeightPx: number,
	secondDimensionMaxValue: number,
	reservePlayerSpace: boolean,
): string {
	const cappedHeight = secondDimensionMaxValue
		? Math.min(secondDimensionMaxValue, viewportHeightPx)
		: viewportHeightPx;
	if (!reservePlayerSpace) return `${cappedHeight}px`;

	const playerSafeHeight = `max(0px, calc(${viewportHeightPx}px - var(--reader-player-reserve-current)))`;
	return secondDimensionMaxValue
		? `min(${secondDimensionMaxValue}px, ${playerSafeHeight})`
		: playerSafeHeight;
}
