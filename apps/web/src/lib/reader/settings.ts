/**
 * Reader display settings, persisted in localStorage. Settings model, theme
 * palettes and defaults are ported from the ttu ebook reader
 * (BSD-3-Clause, ッツ Reader Authors).
 */

export type WritingMode = "horizontal-tb" | "vertical-rl";
export type ViewMode = "continuous" | "paginated";
export type FuriganaStyle = "Hide" | "Partial" | "Toggle" | "Full";
export type VerticalTextOrientation = "mixed" | "upright";
export type TextMarginMode = "auto" | "manual";
export type BlurMode = "all" | "after-toc";
export type ReaderThemeId =
	| "light-theme"
	| "ecru-theme"
	| "water-theme"
	| "gray-theme"
	| "dark-theme"
	| "black-theme";

export interface ReaderThemeColors {
	fontColor: string;
	backgroundColor: string;
	selectionFontColor: string;
	selectionBackgroundColor: string;
	hintFuriganaShadowColor: string;
	hintFuriganaFontColor: string;
	tooltipTextFontColor: string;
}

export interface ReaderTheme extends ReaderThemeColors {
	id: string;
}

/** User-created themes keyed by name (ttu: `customThemes` store). */
export type CustomReaderThemes = Record<string, ReaderThemeColors>;

const lightBase = {
	fontColor: "rgba(0, 0, 0, 0.87)",
	selectionFontColor: "rgba(245, 245, 245, 1)",
	selectionBackgroundColor: "rgba(151, 151, 151, 1)",
	hintFuriganaFontColor: "rgba(0, 0, 0, 0.38)",
	hintFuriganaShadowColor: "rgba(34, 34, 49, 0.3)",
	tooltipTextFontColor: "rgba(0, 0, 0, 0.6)",
};

const darkBase = {
	fontColor: "rgba(255, 255, 255, 0.87)",
	selectionFontColor: "rgba(85, 90, 92, 0.6)",
	selectionBackgroundColor: "rgba(212, 217, 220, 0.8)",
	hintFuriganaFontColor: "rgba(255, 255, 255, 0.38)",
	hintFuriganaShadowColor: "rgba(240, 240, 241, 0.3)",
	tooltipTextFontColor: "rgba(255, 255, 255, 0.6)",
};

export const readerThemes: ReaderTheme[] = [
	{
		id: "light-theme",
		backgroundColor: "rgba(255, 255, 255, 1)",
		...lightBase,
	},
	{ id: "ecru-theme", backgroundColor: "rgba(247, 246, 235, 1)", ...lightBase },
	{
		id: "water-theme",
		backgroundColor: "rgba(223, 236, 244, 1)",
		...lightBase,
	},
	{ id: "gray-theme", backgroundColor: "rgba(35, 39, 42, 1)", ...darkBase },
	{
		id: "dark-theme",
		backgroundColor: "rgba(18, 18, 18, 1)",
		...darkBase,
		fontColor: "rgba(255, 255, 255, 0.6)",
		hintFuriganaFontColor: "rgba(255, 255, 255, 0.228)",
	},
	{ id: "black-theme", backgroundColor: "rgba(0, 0, 0, 1)", ...darkBase },
];

/** ttu resolution order: built-in themes, then custom themes, then light. */
export function getReaderTheme(
	id: string,
	customThemes?: CustomReaderThemes,
): ReaderTheme {
	const builtin = readerThemes.find((t) => t.id === id);
	if (builtin) return builtin;
	const custom = customThemes?.[id];
	if (custom) return { ...custom, id };
	return readerThemes[0];
}

/**
 * Document scrollbar thumb while reading. The app-wide `var(--border)` thumb
 * follows the app theme, not the reader theme, so mix the thumb from the
 * theme's own colors (in oklab — oklch desaturates neutrals toward brown).
 */
export function getReaderScrollbarColor(theme: ReaderThemeColors): string {
	return `color-mix(in oklab, ${theme.fontColor} 40%, ${theme.backgroundColor})`;
}

const CUSTOM_THEMES_KEY = "nanahoshi-reader-custom-themes";

export function loadCustomThemes(): CustomReaderThemes {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(CUSTOM_THEMES_KEY);
		return raw ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

export function saveCustomThemes(themes: CustomReaderThemes) {
	try {
		window.localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
	} catch {
		// no-op (private mode, quota...)
	}
}

export interface ReaderSettings {
	/** Built-in theme id or a custom theme name. */
	theme: string;
	viewMode: ViewMode;
	fontFamilyGroupOne: string;
	fontFamilyGroupTwo: string;
	fontWeight: number | null;
	fontSize: number;
	lineHeight: number;
	textIndentation: number;
	textMarginMode: TextMarginMode;
	textMarginValue: number;
	writingMode: WritingMode;
	verticalTextOrientation: VerticalTextOrientation;
	/** Vertical-only: adds the "vkrn" font feature (better vertical kerning). */
	enableFontKerning: boolean;
	/** Vertical-only: adds the "vpal" font feature (proportional vertical metrics). */
	enableFontVPAL: boolean;
	prioritizeReaderStyles: boolean;
	enableTextJustification: boolean;
	enableTextWrapPretty: boolean;
	/** Reader max height (vertical) / max width (horizontal), 0 = unlimited. */
	secondDimensionMaxValue: number;
	/** Reader left/right margin (vertical) / top/bottom margin (horizontal). */
	firstDimensionMargin: number;
	autoPositionOnResize: boolean;
	autoBookmark: boolean;
	autoBookmarkTime: number;
	disableWheelNavigation: boolean;
	showCharacterCounter: boolean;
	showPercentage: boolean;
	hideSpoilerImage: boolean;
	blurMode: BlurMode;
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
	autoScrollMultiplier: number;
	avoidPageBreak: boolean;
	pageColumns: number;
}

/** Same defaults as the ttu reader store. */
export const defaultReaderSettings: ReaderSettings = {
	theme: "light-theme",
	viewMode: "paginated",
	fontFamilyGroupOne: "Noto Serif JP",
	fontFamilyGroupTwo: "Noto Sans JP",
	fontWeight: null,
	fontSize: 20,
	lineHeight: 1.65,
	textIndentation: 0,
	textMarginMode: "auto",
	textMarginValue: 0,
	writingMode: "vertical-rl",
	verticalTextOrientation: "mixed",
	enableFontKerning: false,
	enableFontVPAL: false,
	prioritizeReaderStyles: false,
	enableTextJustification: false,
	enableTextWrapPretty: false,
	secondDimensionMaxValue: 0,
	firstDimensionMargin: 0,
	autoPositionOnResize: true,
	autoBookmark: true,
	autoBookmarkTime: 3,
	disableWheelNavigation: false,
	showCharacterCounter: true,
	showPercentage: true,
	hideSpoilerImage: true,
	blurMode: "after-toc",
	hideFurigana: false,
	furiganaStyle: "Partial",
	autoScrollMultiplier: 20,
	avoidPageBreak: false,
	pageColumns: 0,
};

const SETTINGS_KEY = "nanahoshi-reader-settings";

export function loadReaderSettings(): ReaderSettings {
	if (typeof window === "undefined") return defaultReaderSettings;
	try {
		const raw = window.localStorage.getItem(SETTINGS_KEY);
		if (!raw) return defaultReaderSettings;
		return { ...defaultReaderSettings, ...JSON.parse(raw) };
	} catch {
		return defaultReaderSettings;
	}
}

export function saveReaderSettings(settings: ReaderSettings) {
	try {
		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// no-op (private mode, quota...)
	}
}
