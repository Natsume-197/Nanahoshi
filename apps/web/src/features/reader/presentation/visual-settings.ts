/** Settings shared by every image-first publication: comics, webtoons, art
 * books, and any other ordered sequence of visual pages. */
export type VisualReadingDirection = "auto" | "ltr" | "rtl";
export type VisualLayout =
	| "horizontal-strip"
	| "single-page"
	| "two-page-spread"
	| "vertical-strip";
export type VisualProgressStyle = "text" | "page-lines" | "bar";

export interface VisualReaderSettings {
	layout: VisualLayout;
	readingDirection: VisualReadingDirection;
	progressStyle: VisualProgressStyle;
}

export const defaultVisualReaderSettings: VisualReaderSettings = {
	layout: "single-page",
	readingDirection: "auto",
	progressStyle: "text",
};

const VISUAL_SETTINGS_KEY = "nanahoshi-visual-reader-settings";

export function loadVisualReaderSettings(): VisualReaderSettings {
	if (typeof window === "undefined") return defaultVisualReaderSettings;
	try {
		const stored = JSON.parse(
			window.localStorage.getItem(VISUAL_SETTINGS_KEY) ?? "null",
		) as Partial<VisualReaderSettings> | null;
		return {
			layout: isVisualLayout(stored?.layout)
				? stored.layout
				: defaultVisualReaderSettings.layout,
			readingDirection:
				stored?.readingDirection === "ltr" || stored?.readingDirection === "rtl"
					? stored.readingDirection
					: "auto",
			progressStyle:
				stored?.progressStyle === "page-lines" ||
				stored?.progressStyle === "bar"
					? stored.progressStyle
					: "text",
		};
	} catch {
		return defaultVisualReaderSettings;
	}
}

export function saveVisualReaderSettings(settings: VisualReaderSettings): void {
	try {
		window.localStorage.setItem(VISUAL_SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Offline/private storage may reject writes; the live setting still works.
	}
}

function isVisualLayout(value: unknown): value is VisualLayout {
	return (
		value === "horizontal-strip" ||
		value === "single-page" ||
		value === "two-page-spread" ||
		value === "vertical-strip"
	);
}
