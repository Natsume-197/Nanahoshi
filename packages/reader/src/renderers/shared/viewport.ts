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

/** CSS height for a fixed vertical reading column. The route is shorter than
 * the viewport by the reserve (the player, or the bottom safe area without
 * one), so subtract it after applying the configured cap: otherwise the column
 * runs past the route and its last line is clipped. */
export function readerColumnHeightCss(
	viewportHeightPx: number,
	secondDimensionMaxValue: number,
): string {
	const height = secondDimensionMaxValue
		? Math.min(secondDimensionMaxValue, viewportHeightPx)
		: viewportHeightPx;
	return wholePixels(
		`max(0px, calc(${height}px - var(--reader-player-reserve-current)))`,
	);
}

/** Rounds a CSS length down to whole pixels. Pages advance by the integer
 * clientHeight, so a fractional page (a 15.14px safe area) drifts a little
 * further on every turn until the first line is clipped. */
export function wholePixels(length: string): string {
	return typeof CSS !== "undefined" &&
		CSS.supports?.("height", "round(down, 1.5px, 1px)")
		? `round(down, ${length}, 1px)`
		: length;
}
