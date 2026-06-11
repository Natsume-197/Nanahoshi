import type {
	FuriganaStyle,
	ReaderTheme,
	TextMarginMode,
	VerticalTextOrientation,
} from "@/lib/reader/settings";
import type {
	ReaderBookmark,
	Section,
	SectionWithProgress,
} from "@/lib/reader/types";

/** Imperative handle the parent route drives the active reader mode through. */
export interface BookReaderApi {
	nextPage(): void;
	prevPage(): void;
	navigateToSection(reference: string): void;
	toggleAutoScroll(): void;
	setAutoScrollMultiplier(multiplier: number): void;
	getBookmark(): ReaderBookmark | undefined;
	scrollToBookmark(bookmark: ReaderBookmark): void;
	showBookmarkMarker(bookmark: ReaderBookmark | undefined): void;
	/** Re-measure after a live (non-remount) layout-affecting setting change. */
	relayout(): void;
	/**
	 * Fullscreen overlays can't cover the document scrollbar (it paints in the
	 * viewport gutter, outside any element) — drop it entirely while one is up.
	 * Un-hiding re-anchors the reading position after the gutter reflow.
	 */
	setScrollbarHidden(hidden: boolean): void;
}

/**
 * Props common to both reader modes (continuous + paginated). Each mode extends
 * this with its own extras (auto-scroll for continuous, columns/page-break for
 * paginated).
 */
export interface BaseReaderProps {
	htmlContent: string;
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
	hideSpoilerImage: boolean;
	disableWheelNavigation: boolean;
	sections: Section[];
	/** Reading position to restore (scroll/page target), shown to no one. */
	initialPosition: ReaderBookmark | undefined;
	/** Saved bookmark, displayed as the marker; never used for restoring. */
	initialBookmark: ReaderBookmark | undefined;
	/**
	 * `programmatic` marks position changes the user didn't make (initial
	 * restore, resize/image-load corrections) so callers can ignore them for
	 * things like auto-bookmarking.
	 */
	onExploredCharCountChange: (count: number, programmatic?: boolean) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	apiRef: (api: BookReaderApi | null) => void;
}
