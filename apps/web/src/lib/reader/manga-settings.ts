export type MangaReadingDirection = "auto" | "ltr" | "rtl";
export type ComicLayout =
	| "horizontal-strip"
	| "single-page"
	| "two-page-spread"
	| "vertical-strip";
export type MangaProgressStyle = "text" | "page-lines" | "bar";

export interface MangaReaderSettings {
	layout: ComicLayout;
	readingDirection: MangaReadingDirection;
	progressStyle: MangaProgressStyle;
}

export const defaultMangaReaderSettings: MangaReaderSettings = {
	layout: "single-page",
	readingDirection: "auto",
	progressStyle: "text",
};

const MANGA_SETTINGS_KEY = "nanahoshi-manga-reader-settings";

type StoredMangaSettings = Partial<MangaReaderSettings> & {
	viewMode?: unknown;
	flow?: "paginated" | "continuous";
	pageLayout?: "auto" | "single" | "spread";
};

function normalizeComicLayout(stored: StoredMangaSettings): ComicLayout {
	if (
		stored.layout === "horizontal-strip" ||
		stored.layout === "single-page" ||
		stored.layout === "two-page-spread" ||
		stored.layout === "vertical-strip"
	) {
		return stored.layout;
	}
	if (stored.viewMode === "wide-strip") return "horizontal-strip";
	if (stored.viewMode === "double-page") return "two-page-spread";
	if (stored.viewMode === "long-strip") return "vertical-strip";
	if (stored.viewMode === "single-page") return "single-page";
	if (stored.flow === "continuous") return "vertical-strip";
	if (stored.pageLayout === "spread") return "two-page-spread";
	return "single-page";
}

export function loadMangaReaderSettings(): MangaReaderSettings {
	if (typeof window === "undefined") return defaultMangaReaderSettings;
	try {
		const parsed = JSON.parse(
			window.localStorage.getItem(MANGA_SETTINGS_KEY) ?? "null",
		) as StoredMangaSettings | null;
		const stored = parsed ?? {};
		return {
			layout: normalizeComicLayout(stored),
			readingDirection:
				stored.readingDirection === "ltr" || stored.readingDirection === "rtl"
					? stored.readingDirection
					: "auto",
			progressStyle:
				stored.progressStyle === "page-lines" || stored.progressStyle === "bar"
					? stored.progressStyle
					: "text",
		};
	} catch {
		return defaultMangaReaderSettings;
	}
}

export function saveMangaReaderSettings(settings: MangaReaderSettings) {
	try {
		window.localStorage.setItem(MANGA_SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// Offline/private storage may reject writes; the live setting still works.
	}
}
