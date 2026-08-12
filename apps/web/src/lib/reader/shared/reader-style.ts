import type { CSSProperties } from "react";
import type {
	FuriganaStyle,
	ReaderTheme,
	TextMarginMode,
	VerticalTextOrientation,
} from "@/lib/reader/settings";

interface ReaderStyleConfig {
	theme: ReaderTheme;
	fontFamilyGroupOne: string;
	fontFamilyGroupTwo: string;
	fontWeight: number | null;
	fontSize: number;
	lineHeight: number;
	textIndentation: number;
	textMarginValue: number;
	verticalTextOrientation: VerticalTextOrientation;
	verticalMode: boolean;
	firstDimensionMargin: number;
	/** Vertical-only font features: "vkrn" (kerning) and "vpal". */
	enableFontKerning: boolean;
	enableFontVPAL: boolean;
}

/**
 * The base inline style shared by both reader modes: text color/metrics, the
 * physical first-dimension padding, and the CSS custom properties the book
 * stylesheet reads (fonts, furigana/selection colors, text margin/indent).
 *
 * Each mode spreads this and adds its own layout-specific bits (max width /
 * height, column width, child height, image max width).
 */
export function buildReaderStyle(c: ReaderStyleConfig): CSSProperties {
	// ttu: vertical-only font features, joined like its fontFeatureSettings.
	const fontFeatureSettings = c.verticalMode
		? [c.enableFontKerning && '"vkrn"', c.enableFontVPAL && '"vpal"']
				.filter(Boolean)
				.join(", ")
		: "";

	return {
		color: c.theme.fontColor,
		fontSize: `${c.fontSize}px`,
		lineHeight: `${c.lineHeight}`,
		textOrientation: c.verticalTextOrientation,
		fontFeatureSettings: fontFeatureSettings || undefined,
		paddingTop:
			!c.verticalMode && c.firstDimensionMargin
				? `${c.firstDimensionMargin}px`
				: undefined,
		paddingBottom:
			!c.verticalMode && c.firstDimensionMargin
				? `${c.firstDimensionMargin}px`
				: undefined,
		paddingLeft:
			c.verticalMode && c.firstDimensionMargin
				? `${c.firstDimensionMargin}px`
				: undefined,
		paddingRight:
			c.verticalMode && c.firstDimensionMargin
				? `${c.firstDimensionMargin}px`
				: undefined,
		...({
			"--font-family-serif": c.fontFamilyGroupOne,
			"--font-family-sans-serif": c.fontFamilyGroupTwo,
			"--font-weight": c.fontWeight ?? undefined,
			"--book-content-hint-furigana-font-color": c.theme.hintFuriganaFontColor,
			"--book-content-hint-furigana-shadow-color":
				c.theme.hintFuriganaShadowColor,
			"--book-content-selection-font-color": c.theme.selectionFontColor,
			"--book-content-selection-background-color":
				c.theme.selectionBackgroundColor,
			"--book-content-text-margin": `${c.textMarginValue ?? 0}rem`,
			"--book-content-text-intendation": `${c.textIndentation ?? 0}rem`,
		} as CSSProperties),
	};
}

/**
 * Continuous-mode sizing for the book surface. Horizontal text must own the
 * full available inline size and clip publication CSS on the non-reading axis:
 * otherwise a wide EPUB descendant contributes to the root scrollWidth, and a
 * modal scroll lock can turn that hidden overflow into a viewport scrollbar.
 */
export function buildContinuousReaderSizing(
	verticalMode: boolean,
	secondDimensionMaxValue: number,
): CSSProperties {
	if (verticalMode) {
		return {
			maxHeight: secondDimensionMaxValue
				? `${secondDimensionMaxValue}px`
				: undefined,
		};
	}

	return {
		boxSizing: "border-box",
		width: "100%",
		minWidth: 0,
		maxWidth: secondDimensionMaxValue
			? `${secondDimensionMaxValue}px`
			: undefined,
		overflowX: "clip",
	};
}

interface ReaderClassesConfig {
	mode: "continuous" | "paginated" | "focus";
	verticalMode: boolean;
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
	fontWeight: number | null;
	prioritizeReaderStyles: boolean;
	enableTextJustification: boolean;
	enableTextWrapPretty: boolean;
	textMarginMode: TextMarginMode;
	/** Paginated only; ignored in continuous mode. */
	avoidPageBreak?: boolean;
}

/** The `book-content` class list shared by both reader modes. */
export function buildReaderClasses(c: ReaderClassesConfig): string {
	return [
		`book-content book-content--${c.mode} m-auto`,
		c.verticalMode
			? "book-content--writing-vertical-rl"
			: "book-content--writing-horizontal-tb",
		c.avoidPageBreak ? "book-content--avoid-page-break" : "",
		c.hideFurigana
			? `book-content--hide-furigana book-content--furigana-style-${c.furiganaStyle.toLowerCase()}`
			: "",
		c.fontWeight ? "ttu-apply-font-weight" : "",
		c.prioritizeReaderStyles ? "ttu-apply-important" : "",
		c.enableTextJustification ? "ttu-apply-justification" : "",
		c.enableTextWrapPretty ? "ttu-text-wrap-pretty" : "",
		c.textMarginMode === "manual" ? "ttu-margin-manual" : "",
	]
		.filter(Boolean)
		.join(" ");
}
