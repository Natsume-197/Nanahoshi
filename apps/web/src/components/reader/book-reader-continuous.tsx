/**
 * React port of the ttu ebook reader continuous mode
 * (BSD-3-Clause, ッツ Reader Authors).
 *
 * The parent remounts this component (via `key`) whenever a layout-affecting
 * setting changes, so writing mode, font metrics and margins are constant for
 * the lifetime of one instance — recalculation is only needed on resize and
 * image loads.
 */

import { BookmarkSimple } from "@phosphor-icons/react";
import { type CSSProperties, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import { AutoScrollerContinuous } from "@/lib/reader/auto-scroller";
import {
	BookmarkManagerContinuous,
	type BookmarkPosData,
} from "@/lib/reader/bookmark-manager-continuous";
import { CharacterStatsCalculator } from "@/lib/reader/character-stats-calculator";
import { prependValue } from "@/lib/reader/epub/generate-epub-html";
import { horizontalMouseWheel } from "@/lib/reader/horizontal-mouse-wheel";
import { refitImageWidths } from "@/lib/reader/image-dimensions";
import { PageManagerContinuous } from "@/lib/reader/page-manager-continuous";
import {
	getReaderScrollbarColor,
	getReaderScrollbarTrackColor,
} from "@/lib/reader/settings";
import { injectSpoilerLabels } from "@/lib/reader/shared/inject-spoiler-labels";
import { handleReaderContentClick } from "@/lib/reader/shared/reader-content-click";
import { applyReaderDocumentChrome } from "@/lib/reader/shared/reader-document-chrome";
import {
	buildReaderClasses,
	buildReaderStyle,
} from "@/lib/reader/shared/reader-style";
import type { ReaderBookmark, SectionWithProgress } from "@/lib/reader/types";
import { readerColumnHeight, viewportWidth } from "@/lib/reader/viewport";
import { ReaderLoadingOverlay } from "./reader-loading-overlay";
import type { BaseReaderProps } from "./reader-shared-props";

export type { SectionWithProgress } from "@/lib/reader/types";
export type { BookReaderApi } from "./reader-shared-props";

interface BookReaderContinuousProps extends BaseReaderProps {
	autoPositionOnResize: boolean;
	autoScrollMultiplier: number;
	onAutoScrollChange: (enabled: boolean) => void;
}

interface ReaderInternals {
	calculator?: CharacterStatsCalculator;
	bookmarkManager?: BookmarkManagerContinuous;
	pageManager?: PageManagerContinuous;
	autoScroller?: AutoScrollerContinuous;
	scrollAdjustment: number;
	prevIntendedCharCount: number;
	isProgrammaticScroll: boolean;
	/**
	 * True while paragraph positions are stale (font/image loads, resize,
	 * live setting reflows) until the matching re-measure completes. Scroll
	 * events fired by the browser during reflows (clamping, anchoring) would
	 * otherwise be measured against stale positions and corrupt
	 * prevIntendedCharCount — the position every correction scrolls back to.
	 */
	layoutDirty: boolean;
	displayedBookmark?: ReaderBookmark;
	sectionToElement: Map<string, HTMLElement>;
	sectionData: Map<string, SectionWithProgress>;
	recalcTimer?: ReturnType<typeof setTimeout>;
	resizeTimer?: ReturnType<typeof setTimeout>;
	sectionTimer?: ReturnType<typeof setTimeout>;
	scrollRafPending?: boolean;
}

export function BookReaderContinuous({
	htmlContent,
	verticalMode,
	theme,
	fontFamilyGroupOne,
	fontFamilyGroupTwo,
	fontWeight,
	fontSize,
	lineHeight,
	textIndentation,
	textMarginMode,
	textMarginValue,
	verticalTextOrientation,
	enableFontKerning,
	enableFontVPAL,
	prioritizeReaderStyles,
	enableTextJustification,
	enableTextWrapPretty,
	secondDimensionMaxValue,
	firstDimensionMargin,
	hideFurigana,
	furiganaStyle,
	hideSpoilerImage,
	disableWheelNavigation,
	autoPositionOnResize,
	autoScrollMultiplier,
	sections,
	initialPosition,
	initialBookmark,
	onExploredCharCountChange,
	onSectionProgressChange,
	onAutoScrollChange,
	apiRef,
}: BookReaderContinuousProps) {
	const contentElRef = useRef<HTMLDivElement | null>(null);
	const internalsRef = useRef<ReaderInternals>({
		scrollAdjustment: 0,
		prevIntendedCharCount: initialPosition?.exploredCharCount ?? 0,
		isProgrammaticScroll: false,
		// Dirty until finishInit measures everything for the first time.
		layoutDirty: true,
		sectionToElement: new Map(),
		sectionData: new Map(),
	});
	const [allowDisplay, setAllowDisplay] = useState(false);
	const [bookmarkPos, setBookmarkPos] = useState<BookmarkPosData | undefined>(
		undefined,
	);

	const onExploredChangeRef = useRef(onExploredCharCountChange);
	onExploredChangeRef.current = onExploredCharCountChange;
	const onSectionProgressChangeRef = useRef(onSectionProgressChange);
	onSectionProgressChangeRef.current = onSectionProgressChange;
	const onAutoScrollChangeRef = useRef(onAutoScrollChange);
	onAutoScrollChangeRef.current = onAutoScrollChange;
	const disableWheelNavigationRef = useRef(disableWheelNavigation);
	disableWheelNavigationRef.current = disableWheelNavigation;
	// Live settings read by long-lived DOM handlers (the component does not
	// remount when these change, so closures must not capture them).
	const livePropsRef = useRef({
		fontSize,
		firstDimensionMargin,
		secondDimensionMaxValue,
		hideFurigana,
		furiganaStyle,
		hideSpoilerImage,
	});
	livePropsRef.current = {
		fontSize,
		firstDimensionMargin,
		secondDimensionMaxValue,
		hideFurigana,
		furiganaStyle,
		hideSpoilerImage,
	};

	// Live layout props reflow the book on React commit, before the parent
	// gets to call relayout(); mark the window so reflow-induced scroll events
	// don't overwrite the intended reading position. (Render-phase ref
	// tracking, see the no-useEffect rule.)
	const layoutSignature = [
		fontFamilyGroupOne,
		fontFamilyGroupTwo,
		fontWeight,
		fontSize,
		lineHeight,
		textIndentation,
		textMarginMode,
		textMarginValue,
		prioritizeReaderStyles,
		enableTextJustification,
		enableTextWrapPretty,
		secondDimensionMaxValue,
		firstDimensionMargin,
		hideFurigana,
		furiganaStyle,
		enableFontKerning,
		enableFontVPAL,
	].join("|");
	const prevLayoutSignatureRef = useRef(layoutSignature);
	if (prevLayoutSignatureRef.current !== layoutSignature) {
		prevLayoutSignatureRef.current = layoutSignature;
		internalsRef.current.layoutDirty = true;
	}

	const reportExplored = () => {
		const s = internalsRef.current;
		if (!s.calculator) return;
		onExploredChangeRef.current(s.calculator.calcExploredCharCount());
	};

	// Keep the intended position stable across reflows. Only move when the
	// reflow actually displaced the position into a different paragraph step
	// (getReadingEdgeScrollPos anchors the paragraph's leading edge, consistent
	// with calcExploredCharCount, so a settled layout compares equal and we
	// don't fight it).
	const restoreIntendedPos = () => {
		const s = internalsRef.current;
		if (!s.calculator || !s.pageManager) return;
		if (s.calculator.calcExploredCharCount() === s.prevIntendedCharCount) {
			return;
		}
		s.isProgrammaticScroll = true;
		s.pageManager.scrollTo(
			s.calculator.getReadingEdgeScrollPos(s.prevIntendedCharCount),
		);
	};

	// Re-measures are committed; lift the dirty window on the next frame so
	// scroll callbacks already queued against stale positions drain first.
	const clearLayoutDirtyNextFrame = () => {
		requestAnimationFrame(() => {
			internalsRef.current.layoutDirty = false;
		});
	};

	const updateSectionProgress = () => {
		const s = internalsRef.current;
		if (!s.sectionToElement.size) return;

		for (const [ref, entry] of s.sectionData.entries()) {
			const elm = s.sectionToElement.get(ref);
			if (!elm) continue;
			const rect = elm.getBoundingClientRect();

			const margin = livePropsRef.current.firstDimensionMargin || 0;
			entry.progress = verticalMode
				? (Math.min(
						Math.max(rect.right + margin - viewportWidth(), 0),
						rect.width,
					) /
						(rect.width || 1)) *
					100
				: (Math.abs(Math.min(Math.max(rect.top - margin, -rect.height), 0)) /
						(rect.height || 1)) *
					100;

			s.sectionData.set(ref, entry);
		}

		onSectionProgressChangeRef.current(new Map(s.sectionData));
	};

	// Keep reserved image widths in sync with the viewport height cap they
	// mirror (max-height rules in reader.css), so the cap never engages and
	// distorts an image whose `width` attribute is set.
	const refitImages = () => {
		const contentEl = contentElRef.current;
		if (!contentEl) return;
		refitImageWidths(
			contentEl,
			readerColumnHeight(
				verticalMode,
				livePropsRef.current.secondDimensionMaxValue,
			),
		);
	};

	// Vertical mode: pin the reading strip to the measured reading area so it
	// fills the viewport exactly — no dead gap below the text, no clipped top
	// line. `viewportHeight()` (documentElement.clientHeight) already excludes a
	// classic horizontal scrollbar and is reliable CSS px on HiDPI, unlike the
	// `100dvh` unit + scrollbar probe it replaces. Read after layout (finishInit
	// / resize) when the horizontal scrollbar is present; the CSS `height:100dvh`
	// rule is the pre-measure fallback while the loading overlay is up.
	const applyVerticalReadingHeight = () => {
		const contentEl = contentElRef.current;
		if (!contentEl || !verticalMode) return;
		// The rendered column height = viewport height, capped by the optional
		// max-height setting. Drive the strip height AND the image-height cap from
		// this one measured value so tall images can never exceed the column
		// (which would overflow it and let the page scroll on Y). Stays correct
		// across the mobile dynamic viewport, unlike the value baked at render.
		const column = readerColumnHeight(
			verticalMode,
			livePropsRef.current.secondDimensionMaxValue,
		);
		contentEl.style.height = `${column}px`;
		contentEl.style.setProperty("--book-content-child-height", `${column}px`);
		// Vertical mode reads along the horizontal axis; the vertical axis must
		// stay pinned at 0. `overflow-y: hidden` only hides the scrollbar — it
		// does not clear a residual vertical offset carried over from horizontal
		// mode's vertical reading scroll, which (clamped to any stray vertical
		// overflow) shifts every column up and clips the top line. Reset it
		// without touching the horizontal reading scroll.
		if (window.scrollY !== 0) {
			window.scrollTo({ top: 0, left: window.scrollX });
		}
	};

	const refreshBookmarkMarker = (bookmark: ReaderBookmark | undefined) => {
		const s = internalsRef.current;
		s.displayedBookmark = bookmark;
		if (!bookmark || !s.bookmarkManager) {
			setBookmarkPos(undefined);
			return;
		}
		setBookmarkPos(s.bookmarkManager.getBookmarkBarPosition(bookmark));
	};

	const navigateToSection = (reference: string) => {
		const s = internalsRef.current;
		let targetElement = document.getElementById(reference);
		if (!targetElement) return;

		if (!reference.startsWith(prependValue)) {
			targetElement =
				targetElement.closest(`div[id^="${prependValue}"]`) || targetElement;
		}

		const rect = targetElement.getBoundingClientRect();
		const margin = livePropsRef.current.firstDimensionMargin || 0;

		if (verticalMode) {
			window.scrollBy(
				-(viewportWidth() - rect.right - margin - s.scrollAdjustment),
				0,
			);
		} else {
			window.scrollBy(0, rect.top - margin - s.scrollAdjustment);
		}
	};

	const scrollToBookmarkPos = (bookmark: ReaderBookmark) => {
		const s = internalsRef.current;
		if (!s.calculator || !s.pageManager) return;

		// Make the bookmark the position the reflow corrector holds, or the next
		// image-load/resize/relayout would yank us back to where we were before
		// the jump (e.g. pressing "r" after scrolling away).
		s.prevIntendedCharCount = bookmark.exploredCharCount;

		// Count 0 = the very start of the book; no paragraph to anchor.
		if (!bookmark.exploredCharCount) {
			s.isProgrammaticScroll = true;
			s.pageManager.scrollTo(0);
			return;
		}

		// Same writing mode the bookmark was saved in: the stored pixel offset is
		// still valid, restore it exactly (keeps the in-paragraph offset).
		const exact = s.bookmarkManager?.getExactScroll(bookmark);
		if (exact) {
			s.isProgrammaticScroll = true;
			window.scrollTo(exact);
			return;
		}

		// Different orientation/mode: the stored pixel offset is meaningless, so
		// anchor the bookmark's paragraph at the reading edge by char count.
		s.isProgrammaticScroll = true;
		s.pageManager.scrollTo(
			s.calculator.getReadingEdgeScrollPos(bookmark.exploredCharCount),
		);
	};

	useMountEffect(() => {
		const contentEl = contentElRef.current;
		if (!contentEl) return;

		// Set the book HTML imperatively, outside React reconciliation: with
		// dangerouslySetInnerHTML React 19 re-sets innerHTML when the {__html}
		// wrapper identity changes, which detaches the nodes the calculator
		// measures and forces every image to reload on each re-render.
		contentEl.innerHTML = htmlContent;

		const s = internalsRef.current;
		let cancelled = false;

		// Global document chrome (writing-mode, overflow locks, themed scrollbar,
		// touch-action, background) set+teardown in one place — see the helper.
		// The vertical reading-strip height is pinned separately in
		// finishInit/resize (applyVerticalReadingHeight); the CSS `height:100dvh`
		// rule is the fallback until then (hidden behind the loading overlay).
		const cleanupChrome = applyReaderDocumentChrome({
			mode: "continuous",
			verticalMode,
			backgroundColor: theme.backgroundColor,
			scrollbarColor: getReaderScrollbarColor(theme),
			scrollbarTrackColor: getReaderScrollbarTrackColor(theme),
		});

		const calculator = new CharacterStatsCalculator(
			contentEl,
			verticalMode ? "vertical" : "horizontal",
			verticalMode ? "rtl" : "ltr",
			document.documentElement,
			document,
		);
		const bookmarkManager = new BookmarkManagerContinuous(
			calculator,
			window,
			firstDimensionMargin || 0,
		);
		const pageManager = new PageManagerContinuous(
			verticalMode,
			firstDimensionMargin || 0,
			window,
		);
		const autoScroller = new AutoScrollerContinuous(
			autoScrollMultiplier,
			verticalMode,
			document,
		);
		autoScroller.setToggleListener((enabled) =>
			onAutoScrollChangeRef.current(enabled),
		);

		s.calculator = calculator;
		s.bookmarkManager = bookmarkManager;
		s.pageManager = pageManager;
		s.autoScroller = autoScroller;
		injectSpoilerLabels(contentEl, document);

		const handleContentClick = (event: MouseEvent) =>
			handleReaderContentClick(event, livePropsRef.current, navigateToSection);
		contentEl.addEventListener("click", handleContentClick);

		// Layout shifts from late image loads: recalculate paragraph positions
		// and keep the intended reading position stable.
		const scheduleRecalc = () => {
			clearTimeout(s.recalcTimer);
			s.recalcTimer = setTimeout(() => {
				if (cancelled) return;
				calculator.updateParagraphPos();
				restoreIntendedPos();
				reportExplored();
				updateSectionProgress();
				refreshBookmarkMarker(s.displayedBookmark);
				clearLayoutDirtyNextFrame();
			}, 150);
		};
		const handleResourceLoad = () => {
			s.layoutDirty = true;
			scheduleRecalc();
		};
		contentEl.addEventListener("load", handleResourceLoad, true);

		// Vertical mode: translate vertical wheel into horizontal page scroll
		const scrollFn = horizontalMouseWheel(
			4,
			document.documentElement,
			requestAnimationFrame,
		);
		const handleWheel = (ev: WheelEvent) => {
			if (verticalMode && !disableWheelNavigationRef.current) {
				scrollFn(ev, livePropsRef.current.fontSize, viewportWidth());
			}
		};
		document.body.addEventListener("wheel", handleWheel, { passive: false });

		const finishInit = () => {
			if (cancelled) return;
			applyVerticalReadingHeight();
			refitImages();
			calculator.updateParagraphPos();

			const firstSection = contentEl.firstElementChild;
			if (firstSection) {
				s.scrollAdjustment =
					Number(
						getComputedStyle(firstSection)[
							verticalMode ? "marginLeft" : "marginBottom"
						].replace(/px$/, ""),
					) / 2 || 0;
			}

			for (const section of sections) {
				const elm = document.getElementById(section.reference);
				if (elm) {
					s.sectionData.set(section.reference, { ...section, progress: 0 });
					s.sectionToElement.set(section.reference, elm);
				}
			}

			if (initialPosition) {
				scrollToBookmarkPos(initialPosition);
			}
			if (initialBookmark) {
				refreshBookmarkMarker(initialBookmark);
			}
			reportExplored();
			updateSectionProgress();
			setAllowDisplay(true);
			clearLayoutDirtyNextFrame();
		};

		document.fonts.ready.then(() => {
			requestAnimationFrame(finishInit);
		});

		apiRef({
			nextPage: () => s.pageManager?.nextPage(),
			prevPage: () => s.pageManager?.prevPage(),
			navigateToSection,
			toggleAutoScroll: () => autoScroller.toggle(),
			setAutoScrollMultiplier: (multiplier) => {
				autoScroller.multiplier = multiplier;
			},
			getBookmark: () => s.bookmarkManager?.formatBookmarkData(),
			scrollToBookmark: (bookmark) => scrollToBookmarkPos(bookmark),
			showBookmarkMarker: (bookmark) => refreshBookmarkMarker(bookmark),
			setScrollbarHidden: (hidden) => {
				// The gutter change reflows the book and fires scroll events; flag
				// them as layout-induced so they don't overwrite the intended
				// position (the recalc on un-hide clears the flag).
				s.layoutDirty = true;
				document.documentElement.style.setProperty(
					"scrollbar-width",
					hidden ? "none" : "auto",
				);
				if (!hidden) scheduleRecalc();
			},
			relayout: () => {
				// Wait for any new font to be ready, then re-measure with the
				// margin/page-size dependent managers rebuilt from live props.
				document.fonts.ready.then(() => {
					requestAnimationFrame(() => {
						if (cancelled) return;
						const margin = livePropsRef.current.firstDimensionMargin || 0;
						s.bookmarkManager = new BookmarkManagerContinuous(
							calculator,
							window,
							margin,
						);
						s.pageManager = new PageManagerContinuous(
							verticalMode,
							margin,
							window,
						);
						refitImages();
						calculator.updateParagraphPos();
						restoreIntendedPos();
						reportExplored();
						updateSectionProgress();
						refreshBookmarkMarker(s.displayedBookmark);
						clearLayoutDirtyNextFrame();
					});
				});
			},
		});

		return () => {
			cancelled = true;
			clearTimeout(s.recalcTimer);
			clearTimeout(s.resizeTimer);
			clearTimeout(s.sectionTimer);
			autoScroller.destroy();
			contentEl.removeEventListener("click", handleContentClick);
			contentEl.removeEventListener("load", handleResourceLoad, true);
			contentEl.innerHTML = "";
			document.body.removeEventListener("wheel", handleWheel);
			cleanupChrome();
			apiRef(null);
		};
	});

	useWindowEvent("scroll", () => {
		const s = internalsRef.current;

		// Coalesce bursts of scroll events into one measurement per frame —
		// each calcExploredCharCount reads the scroll position, which forces a
		// reflow when the layout is dirty.
		if (!s.scrollRafPending) {
			s.scrollRafPending = true;
			requestAnimationFrame(() => {
				s.scrollRafPending = false;
				if (!s.calculator) return;

				const programmatic = s.isProgrammaticScroll || s.layoutDirty;
				const explored = s.calculator.calcExploredCharCount();
				// 0 included: scrolling back to the very top is an intended
				// position too, or the next reflow would yank us back down.
				if (!programmatic) {
					s.prevIntendedCharCount = explored;
				}
				s.isProgrammaticScroll = false;
				onExploredChangeRef.current(explored);
			});
		}

		clearTimeout(s.sectionTimer);
		s.sectionTimer = setTimeout(updateSectionProgress, 500);
	});

	useWindowEvent("resize", () => {
		const s = internalsRef.current;
		// Flag immediately: the reflow fires scroll events (clamping, mobile
		// URL bar) well before the debounced re-measure below runs.
		s.layoutDirty = true;
		clearTimeout(s.resizeTimer);
		s.resizeTimer = setTimeout(() => {
			requestAnimationFrame(() => {
				if (!s.calculator || !s.pageManager) return;
				applyVerticalReadingHeight();
				refitImages();
				s.calculator.updateParagraphPos();
				if (autoPositionOnResize) {
					restoreIntendedPos();
				}
				reportExplored();
				updateSectionProgress();
				refreshBookmarkMarker(s.displayedBookmark);
				clearLayoutDirtyNextFrame();
			});
		}, 100);
	});

	const maxHeight =
		verticalMode && secondDimensionMaxValue
			? secondDimensionMaxValue
			: undefined;
	// readerColumnHeight reads window/document, so guard it for SSR (the strip
	// height is re-pinned client-side in applyVerticalReadingHeight anyway).
	const childHeight =
		typeof window === "undefined"
			? 0
			: readerColumnHeight(verticalMode, secondDimensionMaxValue);

	const containerStyle: CSSProperties = {
		...buildReaderStyle({
			theme,
			fontFamilyGroupOne,
			fontFamilyGroupTwo,
			fontWeight,
			fontSize,
			lineHeight,
			textIndentation,
			textMarginValue,
			verticalTextOrientation,
			verticalMode,
			firstDimensionMargin,
			enableFontKerning,
			enableFontVPAL,
		}),
		maxWidth:
			!verticalMode && secondDimensionMaxValue
				? `${secondDimensionMaxValue}px`
				: undefined,
		maxHeight: maxHeight ? `${maxHeight}px` : undefined,
		...({
			// The image-height cap must equal the *rendered* column height (the
			// smaller of the configured max-height and the viewport), not the
			// configured max alone — on a viewport shorter than the max (mobile,
			// split view) a taller cap lets images overflow the column and the
			// page scroll on touch. applyVerticalReadingHeight keeps this in sync
			// on resize; readerColumnHeight is the single source for the value.
			"--book-content-child-height": `${childHeight}px`,
		} as CSSProperties),
	};

	const containerClasses = buildReaderClasses({
		mode: "continuous",
		verticalMode,
		hideSpoilerImage,
		hideFurigana,
		furiganaStyle,
		fontWeight,
		prioritizeReaderStyles,
		enableTextJustification,
		enableTextWrapPretty,
		textMarginMode,
	});

	const marginBarBase: CSSProperties = {
		position: "fixed",
		zIndex: 5,
		backgroundColor: theme.backgroundColor,
	};

	const bookmarkAdjustment =
		typeof window !== "undefined" &&
		window.matchMedia("(min-width: 640px)").matches
			? "0.5rem"
			: "0.25rem";

	return (
		<>
			<div
				ref={contentElRef}
				className={containerClasses}
				style={containerStyle}
			/>

			{firstDimensionMargin ? (
				<>
					<div
						style={{
							...marginBarBase,
							...(verticalMode
								? { top: 0, bottom: 0, left: 0, width: firstDimensionMargin }
								: { left: 0, right: 0, top: 0, height: firstDimensionMargin }),
						}}
					/>
					<div
						style={{
							...marginBarBase,
							...(verticalMode
								? { top: 0, bottom: 0, right: 0, width: firstDimensionMargin }
								: {
										left: 0,
										right: 0,
										bottom: 0,
										height: firstDimensionMargin,
									}),
						}}
					/>
				</>
			) : null}

			{bookmarkPos &&
				(verticalMode ? (
					<div
						className="pointer-events-none absolute text-xl opacity-25"
						style={{
							color: theme.fontColor,
							right: `calc(${bookmarkPos.right} + 1rem)`,
							top: bookmarkAdjustment,
						}}
					>
						<BookmarkSimple weight="fill" className="size-5" />
					</div>
				) : (
					<div
						className="pointer-events-none absolute text-sm opacity-25 sm:text-xl"
						style={{
							color: theme.fontColor,
							left: bookmarkAdjustment,
							top: `calc(${bookmarkPos.top} + 1.5rem)`,
						}}
					>
						<BookmarkSimple weight="fill" className="size-5" />
					</div>
				))}

			{!allowDisplay && <ReaderLoadingOverlay theme={theme} />}
		</>
	);
}
