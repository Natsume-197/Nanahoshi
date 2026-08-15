/**
 * Reader display settings, persisted in localStorage. Settings model, theme
 * palettes and defaults are ported from the ttu ebook reader
 * (BSD-3-Clause, ッツ Reader Authors).
 */

export type WritingMode = "horizontal-tb" | "vertical-rl";
export type TextLayout = "scroll" | "paginated" | "focus";
export type FuriganaStyle = "Hide" | "Partial" | "Toggle" | "Full";
export type VerticalTextOrientation = "mixed" | "upright";
export type TextMarginMode = "auto" | "manual";
export type ReaderThemeId =
	| "nanahoshi-theme"
	| "attribute-theme"
	| "light-theme"
	| "ecru-theme"
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
		// Nanahoshi's own base surface: same near-black canvas (`--background`)
		// and reading-text color (`--reading`) as the app's default dark theme.
		id: "nanahoshi-theme",
		backgroundColor: "oklch(21.952% 0.00777 285.704)",
		...darkBase,
		fontColor: "oklch(0.9 0.003 285.7)",
		hintFuriganaFontColor: "rgba(255, 255, 255, 0.228)",
	},
	{
		id: "light-theme",
		backgroundColor: "rgba(255, 255, 255, 1)",
		...lightBase,
	},
	{ id: "ecru-theme", backgroundColor: "rgba(247, 246, 235, 1)", ...lightBase },
	{
		id: "dark-theme",
		backgroundColor: "rgba(18, 18, 18, 1)",
		...darkBase,
		fontColor: "rgba(255, 255, 255, 0.6)",
		hintFuriganaFontColor: "rgba(255, 255, 255, 0.228)",
	},
	{
		id: "attribute-theme",
		backgroundColor: "rgba(18, 18, 18, 1)",
		...darkBase,
		fontColor: "rgba(255, 255, 255, 0.9)",
		hintFuriganaFontColor: "rgba(255, 255, 255, 0.228)",
		hintFuriganaShadowColor: "rgba(240, 240, 241, 0.3)",
		tooltipTextFontColor: "rgba(255, 255, 255, 0.6)",
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

/** Fill the document scrollbar gutter with the book surface itself. */
export function getReaderScrollbarTrackColor(theme: ReaderThemeColors): string {
	return theme.backgroundColor;
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
	/** Serialized settings schema; used for one-time preference migrations. */
	settingsVersion: number;
	/** Built-in theme id or a custom theme name. */
	theme: string;
	textLayout: TextLayout;
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
	disableWheelNavigation: boolean;
	showCharacterCounter: boolean;
	showPercentage: boolean;
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
	autoScrollMultiplier: number;
	avoidPageBreak: boolean;
	pageColumns: number;
}

export const READER_SETTINGS_VERSION = 2;

/** Default reader experience for new local settings. */
export const defaultReaderSettings: ReaderSettings = {
	settingsVersion: READER_SETTINGS_VERSION,
	theme: "nanahoshi-theme",
	textLayout: "scroll",
	fontFamilyGroupOne: "Noto Serif JP",
	fontFamilyGroupTwo: "Noto Sans JP",
	fontWeight: null,
	fontSize: 28,
	lineHeight: 1.65,
	textIndentation: 0,
	textMarginMode: "auto",
	textMarginValue: 0,
	writingMode: "horizontal-tb",
	verticalTextOrientation: "mixed",
	enableFontKerning: false,
	enableFontVPAL: false,
	prioritizeReaderStyles: false,
	enableTextJustification: true,
	enableTextWrapPretty: false,
	secondDimensionMaxValue: 0,
	firstDimensionMargin: 0,
	autoPositionOnResize: true,
	disableWheelNavigation: false,
	showCharacterCounter: true,
	showPercentage: true,
	hideFurigana: false,
	furiganaStyle: "Partial",
	autoScrollMultiplier: 20,
	avoidPageBreak: false,
	pageColumns: 0,
};

const SETTINGS_KEY = "nanahoshi-reader-settings";

export const READER_FONT_SIZE_MIN = 12;
export const READER_FONT_SIZE_MAX = 60;
export const READER_LINE_HEIGHT_MIN = 1.2;
export const READER_LINE_HEIGHT_MAX = 2.4;

const clampNumber = (
	value: unknown,
	fallback: number,
	min: number,
	max: number,
) =>
	typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: fallback;

export function normalizeReaderSettings(raw: unknown): ReaderSettings {
	if (!raw || typeof raw !== "object") return defaultReaderSettings;

	const stored = raw as Partial<ReaderSettings>;
	const next = { ...defaultReaderSettings };
	if (
		typeof stored.theme === "string" &&
		stored.theme.trim() &&
		stored.theme !== "water-theme" &&
		stored.theme !== "gray-theme"
	) {
		next.theme = stored.theme;
	}
	if (typeof stored.fontFamilyGroupOne === "string") {
		next.fontFamilyGroupOne = stored.fontFamilyGroupOne;
	}
	if (typeof stored.fontFamilyGroupTwo === "string") {
		next.fontFamilyGroupTwo = stored.fontFamilyGroupTwo;
	}
	if (stored.fontWeight === null) {
		next.fontWeight = null;
	} else if (
		typeof stored.fontWeight === "number" &&
		Number.isFinite(stored.fontWeight)
	) {
		next.fontWeight = Math.round(
			Math.min(900, Math.max(100, stored.fontWeight)),
		);
	}
	if (stored.textMarginMode === "auto" || stored.textMarginMode === "manual")
		next.textMarginMode = stored.textMarginMode;
	if (
		stored.writingMode === "horizontal-tb" ||
		stored.writingMode === "vertical-rl"
	)
		next.writingMode = stored.writingMode;
	if (
		stored.verticalTextOrientation === "mixed" ||
		stored.verticalTextOrientation === "upright"
	)
		next.verticalTextOrientation = stored.verticalTextOrientation;
	if (
		stored.furiganaStyle === "Hide" ||
		stored.furiganaStyle === "Partial" ||
		stored.furiganaStyle === "Toggle" ||
		stored.furiganaStyle === "Full"
	)
		next.furiganaStyle = stored.furiganaStyle;
	const booleanKeys = [
		"enableFontKerning",
		"enableFontVPAL",
		"prioritizeReaderStyles",
		"enableTextWrapPretty",
		"autoPositionOnResize",
		"disableWheelNavigation",
		"showCharacterCounter",
		"showPercentage",
		"hideFurigana",
		"avoidPageBreak",
	] as const;
	for (const key of booleanKeys) {
		if (typeof stored[key] === "boolean") next[key] = stored[key];
	}
	// Before v2 the default was ragged alignment, which leaves an apparent
	// one-glyph gutter in CJK books. Migrate that old default once; from v2 on,
	// an explicit opt-out remains respected.
	if (
		typeof stored.settingsVersion === "number" &&
		stored.settingsVersion >= READER_SETTINGS_VERSION &&
		typeof stored.enableTextJustification === "boolean"
	) {
		next.enableTextJustification = stored.enableTextJustification;
	}
	const legacyViewMode = (raw as { viewMode?: unknown }).viewMode;
	next.textLayout =
		stored.textLayout === "paginated" ||
		stored.textLayout === "scroll" ||
		stored.textLayout === "focus"
			? stored.textLayout
			: legacyViewMode === "paginated"
				? "paginated"
				: "scroll";
	next.fontSize = clampNumber(
		stored.fontSize,
		defaultReaderSettings.fontSize,
		READER_FONT_SIZE_MIN,
		READER_FONT_SIZE_MAX,
	);
	next.lineHeight = clampNumber(
		stored.lineHeight,
		defaultReaderSettings.lineHeight,
		READER_LINE_HEIGHT_MIN,
		READER_LINE_HEIGHT_MAX,
	);
	next.textIndentation = clampNumber(stored.textIndentation, 0, 0, 10);
	next.textMarginValue = clampNumber(stored.textMarginValue, 0, 0, 10);
	next.firstDimensionMargin = clampNumber(
		stored.firstDimensionMargin,
		0,
		0,
		10_000,
	);
	next.secondDimensionMaxValue = clampNumber(
		stored.secondDimensionMaxValue,
		0,
		0,
		10_000,
	);
	next.pageColumns = Math.round(clampNumber(stored.pageColumns, 0, 0, 2));
	next.autoScrollMultiplier = clampNumber(
		stored.autoScrollMultiplier,
		defaultReaderSettings.autoScrollMultiplier,
		1,
		100,
	);
	return next;
}

export function loadReaderSettings(): ReaderSettings {
	if (typeof window === "undefined") return defaultReaderSettings;
	try {
		const raw = window.localStorage.getItem(SETTINGS_KEY);
		if (!raw) return defaultReaderSettings;
		return normalizeReaderSettings(JSON.parse(raw));
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
