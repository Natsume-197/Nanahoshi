// Apply the reader's global document/body styling and return a cleanup that
// removes exactly what it set, keeping set/teardown symmetric so reader styles
// can't leak into the rest of the app. Owns global chrome only — the vertical
// strip height, scroll resets, and content wiring stay in the reader.
export interface ReaderDocumentChromeOptions {
	mode: "continuous" | "paginated";
	verticalMode: boolean;
	backgroundColor: string;
	/** Continuous only: the full-size themed document scrollbar colors. */
	scrollbarColor?: string;
	scrollbarTrackColor?: string;
}

export function applyReaderDocumentChrome(
	o: ReaderDocumentChromeOptions,
): () => void {
	const de = document.documentElement.style;
	const setKeys: string[] = [];
	const setProp = (key: string, value: string) => {
		de.setProperty(key, value);
		setKeys.push(key);
	};

	setProp("writing-mode", o.verticalMode ? "vertical-rl" : "horizontal-tb");
	document.body.style.setProperty("background-color", o.backgroundColor);

	if (o.mode === "continuous") {
		// The reader anchors by character count on every reflow; the browser's own
		// scroll anchoring fights those corrections with extra scrolls.
		setProp("overflow-anchor", "none");
		// The app-wide scrollbar (thin) is too subtle for the reading axis — use a
		// full-size bar themed to the book colors.
		setProp("scrollbar-width", "auto");
		if (o.scrollbarColor && o.scrollbarTrackColor) {
			// Not tracked in setKeys: the unconditional cleanup below already owns
			// scrollbar-color (it also clears the settings overlay's preview tint).
			de.setProperty(
				"scrollbar-color",
				`${o.scrollbarColor} ${o.scrollbarTrackColor}`,
			);
		}
		// Constrain touch panning to the reading axis: `overflow: hidden` blocks the
		// wheel but not off-axis drag/overscroll on touch. Pan stays on along the
		// reading axis (pan-x for vertical-rl, pan-y for horizontal-tb).
		setProp("touch-action", o.verticalMode ? "pan-x" : "pan-y");
		setProp("overscroll-behavior", "none");
		// Vertical reads along the horizontal axis (and vice-versa) — lock the
		// off-axis viewport scroll so stray overflow can't drift the page.
		setProp(o.verticalMode ? "overflow-y" : "overflow-x", "hidden");
	} else {
		document.body.classList.add("overflow-hidden");
	}

	return () => {
		for (const key of setKeys) de.removeProperty(key);
		document.body.style.removeProperty("background-color");
		document.body.classList.remove("overflow-hidden");
		// Also clear scrollbar-color the settings overlay's theme preview may set
		// (paginated never sets it here, but tints the bar while previewing).
		de.removeProperty("scrollbar-color");
	};
}
