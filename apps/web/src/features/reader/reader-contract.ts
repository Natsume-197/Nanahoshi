import type {
	ReaderPosition,
	ReaderTextAnchor,
	Section,
	SectionWithProgress,
} from "@/features/reader/document/types";
import type {
	FuriganaStyle,
	ReaderTheme,
	TextMarginMode,
	VerticalTextOrientation,
} from "@/features/reader/presentation/settings";

/** Operations every reader engine can use to move through a publication. */
export interface ReaderNavigationCapability {
	nextPage(): void;
	prevPage(): void;
	navigateToSection(reference: string): void;
	getPosition(options?: {
		manualBookmark?: boolean;
	}): ReaderPosition | undefined;
	scrollToPosition(position: ReaderPosition): void;
	/** Re-measure after a live (non-remount) layout-affecting setting change. */
	relayout(position?: ReaderPosition): void;
}

/** Semantic text operations supplied by reflowable text engines. */
export interface ReaderTextAnchorCapability {
	/** Navigate/resolve a semantic text target without assuming full-book DOM. */
	navigateToTextAnchor(anchor: ReaderTextAnchor): void;
	resolveTextAnchor(anchor: ReaderTextAnchor): number | undefined;
}

/** PDF-engine capability; opens its native, progressively populated search. */
export interface ReaderSearchCapability {
	openSearch(): void;
}

/** Continuous-engine capability for viewport-level overlays. */
export interface ReaderScrollbarCapability {
	/**
	 * Fullscreen overlays can't cover the document scrollbar (it paints in the
	 * viewport gutter, outside any element) — drop it entirely while one is up.
	 * Un-hiding re-anchors the reading position after the gutter reflow.
	 */
	setScrollbarHidden(hidden: boolean): void;
}

/** Paginated readers can align a browser-initiated scroll to a complete spread. */
export interface ReaderPageSnapCapability {
	snapToPage(): void;
}

/**
 * Imperative handle for the currently mounted engine. Navigation and semantic
 * position are universal; the rest is additive and callers opt into it.
 */
export type BookReaderApi = ReaderNavigationCapability &
	Partial<
		ReaderTextAnchorCapability &
			ReaderSearchCapability &
			ReaderScrollbarCapability &
			ReaderPageSnapCapability
	>;

export function supportsReaderTextAnchors(
	api: BookReaderApi | null | undefined,
): api is BookReaderApi & ReaderTextAnchorCapability {
	return (
		typeof api?.navigateToTextAnchor === "function" &&
		typeof api.resolveTextAnchor === "function"
	);
}

export function supportsReaderSearch(
	api: BookReaderApi | null | undefined,
): api is BookReaderApi & ReaderSearchCapability {
	return typeof api?.openSearch === "function";
}

export function supportsReaderScrollbar(
	api: BookReaderApi | null | undefined,
): api is BookReaderApi & ReaderScrollbarCapability {
	return typeof api?.setScrollbarHidden === "function";
}

/**
 * Props common to both reader modes (continuous + paginated). Each mode extends
 * this with its own extras (columns/page-break for paginated).
 */
export interface BaseReaderProps {
	htmlContent: string;
	/** BCP 47 publication language, used for language-aware text composition. */
	language: string;
	verticalMode: boolean;
	theme: ReaderTheme;
	fontFamilyGroupOne: string;
	fontFamilyGroupTwo: string;
	fontWeight: number | null;
	fontSize: number;
	lineHeight: number;
	textIndentation: number;
	textMarginMode: TextMarginMode;
	textMarginValue: number;
	verticalTextOrientation: VerticalTextOrientation;
	enableFontKerning: boolean;
	enableFontVPAL: boolean;
	prioritizeReaderStyles: boolean;
	enableTextJustification: boolean;
	enableTextWrapPretty: boolean;
	secondDimensionMaxValue: number;
	firstDimensionMargin: number;
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
	disableWheelNavigation: boolean;
	/** Reader navigation is suspended while application chrome owns input. */
	navigationBlocked: boolean;
	sections: Section[];
	/** Reading position to restore (scroll/page target), shown to no one. */
	initialPosition: ReaderPosition | undefined;
	/** The engine's canonical reading coordinate; never infer it from scroll. */
	onPositionChange: (position: ReaderPosition) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	apiRef: (api: BookReaderApi | null) => void;
}
