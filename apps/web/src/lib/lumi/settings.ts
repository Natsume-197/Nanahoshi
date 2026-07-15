import type {
	ReaderSettings as EngineSettings,
	FlowMode,
} from "@lostcoords/lumi-reader-core";
import type { CSSProperties } from "react";
import {
	defaultReaderSettings,
	getReaderTheme,
	loadCustomThemes,
	normalizeReaderSettings,
	type ReaderSettings,
	type ReaderTheme,
} from "@/lib/reader/settings";

/** Reader settings and theme types, shared with the base reader. */
export type { ReaderSettings, ReaderTheme } from "@/lib/reader/settings";

const LUMI_SETTINGS_KEY = "nanahoshi-lumi-settings";

/** Default lumi settings: paginated flow with comfortable sizing. */
export const lumiDefaultSettings: ReaderSettings = {
	...defaultReaderSettings,
	viewMode: "paginated",
	fontSize: 24,
	firstDimensionMargin: 6,
};

/** Load persisted lumi settings, falling back to defaults. */
export function loadLumiSettings(): ReaderSettings {
	if (typeof window === "undefined") return lumiDefaultSettings;
	try {
		const raw = window.localStorage.getItem(LUMI_SETTINGS_KEY);
		if (!raw) return lumiDefaultSettings;
		return normalizeReaderSettings(JSON.parse(raw));
	} catch {
		return lumiDefaultSettings;
	}
}

/** Persist lumi settings to localStorage. */
export function saveLumiSettings(settings: ReaderSettings): void {
	try {
		window.localStorage.setItem(LUMI_SETTINGS_KEY, JSON.stringify(settings));
	} catch {
		// no-op (private mode, quota)
	}
}

/** Whether the lumi engine currently honors each setting; false dims it in the panel. */
export const SETTING_SUPPORT: Record<keyof ReaderSettings, boolean> = {
	theme: true,
	viewMode: true,
	writingMode: true,
	firstDimensionMargin: true,
	pageColumns: true,
	fontFamilyGroupOne: true,
	fontFamilyGroupTwo: false,
	fontSize: true,
	lineHeight: true,
	prioritizeReaderStyles: true,
	showCharacterCounter: true,
	showPercentage: true,
	disableWheelNavigation: true,
	maxCachedBooks: true,
	verticalTextOrientation: false,
	secondDimensionMaxValue: false,
	avoidPageBreak: false,
	fontWeight: false,
	textIndentation: false,
	textMarginMode: false,
	textMarginValue: false,
	enableTextJustification: false,
	enableTextWrapPretty: false,
	enableFontKerning: false,
	enableFontVPAL: false,
	autoPositionOnResize: false,
	hideSpoilerImage: false,
	blurMode: false,
	hideFurigana: false,
	furiganaStyle: false,
	autoScrollMultiplier: false,
};

/** Map lumi settings onto the engine's settings snapshot. */
export function toEngineSettings(settings: ReaderSettings): EngineSettings {
	return {
		readingDirection:
			settings.writingMode === "vertical-rl" ? "vertical" : "horizontal",
		fontSizePx: settings.fontSize,
		lineHeight: settings.lineHeight,
		sideMarginPct: settings.firstDimensionMargin,
		blockMarginPct: 4,
		pageColumns: settings.pageColumns === 0 ? 2 : settings.pageColumns,
		publisherStyles: true,
		japaneseTokens: false,
		forceTextColor: settings.prioritizeReaderStyles,
		fontId: settings.fontFamilyGroupOne,
	};
}

/** Map view mode to the engine's flow mode. */
export function toEngineFlow(viewMode: ReaderSettings["viewMode"]): FlowMode {
	return viewMode === "continuous" ? "continuous" : "paginated";
}

/** CSS custom properties the engine reads for theme colors. */
export function themeVars(theme: ReaderTheme): CSSProperties {
	return {
		background: theme.backgroundColor,
		color: theme.fontColor,
		["--reader-ink" as string]: theme.fontColor,
		["--reader-accent" as string]: theme.selectionBackgroundColor,
	};
}

/** Resolve the active reader theme, including custom themes. */
export function resolveLumiTheme(settings: ReaderSettings): ReaderTheme {
	return getReaderTheme(settings.theme, loadCustomThemes());
}
