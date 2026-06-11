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

let cachedScrollbarSize: number | undefined;

/**
 * Thickness (px) of a classic scrollbar, measured once and cached. Returns 0
 * for overlay scrollbars (which don't take layout space). Used to keep the
 * vertical reading strip clear of the horizontal scrollbar so it doesn't clip
 * the last glyph row.
 */
export function getScrollbarSize(): number {
	if (cachedScrollbarSize !== undefined) return cachedScrollbarSize;
	if (typeof document === "undefined" || !document.body) return 0;

	const probe = document.createElement("div");
	// scrollbar-width:auto matches the full-size bar the reader puts on the
	// document (the app-wide rule would shrink the probe's bar to `thin`).
	probe.style.cssText =
		"position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;scrollbar-width:auto;";
	document.body.appendChild(probe);
	cachedScrollbarSize = probe.offsetWidth - probe.clientWidth;
	probe.remove();
	return cachedScrollbarSize;
}
