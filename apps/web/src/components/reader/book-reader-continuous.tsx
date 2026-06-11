/**
 * React port of the ttu ebook reader continuous mode
 * (BSD-3-Clause, ッツ Reader Authors).
 *
 * The parent remounts this component (via `key`) whenever a layout-affecting
 * setting changes, so writing mode, font metrics and margins are constant for
 * the lifetime of one instance — recalculation is only needed on resize and
 * image loads.
 */

import { Bookmark } from "lucide-react";
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
import { PageManagerContinuous } from "@/lib/reader/page-manager-continuous";
import type {
	FuriganaStyle,
	ReaderTheme,
	TextMarginMode,
	VerticalTextOrientation,
} from "@/lib/reader/settings";
import type { ReaderBookmark, Section } from "@/lib/reader/types";

export type SectionWithProgress = Section & { progress: number };

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
}

interface BookReaderContinuousProps {
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
	prioritizeReaderStyles: boolean;
	enableTextJustification: boolean;
	enableTextWrapPretty: boolean;
	secondDimensionMaxValue: number;
	firstDimensionMargin: number;
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
	hideSpoilerImage: boolean;
	disableWheelNavigation: boolean;
	autoPositionOnResize: boolean;
	autoScrollMultiplier: number;
	sections: Section[];
	initialBookmark: ReaderBookmark | undefined;
	onExploredCharCountChange: (count: number) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	onAutoScrollChange: (enabled: boolean) => void;
	apiRef: (api: BookReaderApi | null) => void;
}

interface ReaderInternals {
	calculator?: CharacterStatsCalculator;
	bookmarkManager?: BookmarkManagerContinuous;
	pageManager?: PageManagerContinuous;
	autoScroller?: AutoScrollerContinuous;
	scrollAdjustment: number;
	prevIntendedCharCount: number;
	isProgrammaticScroll: boolean;
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
	initialBookmark,
	onExploredCharCountChange,
	onSectionProgressChange,
	onAutoScrollChange,
	apiRef,
}: BookReaderContinuousProps) {
	const contentElRef = useRef<HTMLDivElement | null>(null);
	const internalsRef = useRef<ReaderInternals>({
		scrollAdjustment: 0,
		prevIntendedCharCount: initialBookmark?.exploredCharCount ?? 0,
		isProgrammaticScroll: false,
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
		hideFurigana,
		furiganaStyle,
		hideSpoilerImage,
	});
	livePropsRef.current = {
		fontSize,
		firstDimensionMargin,
		hideFurigana,
		furiganaStyle,
		hideSpoilerImage,
	};

	const reportExplored = () => {
		const s = internalsRef.current;
		if (!s.calculator) return;
		onExploredChangeRef.current(s.calculator.calcExploredCharCount());
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
						Math.max(rect.right + margin - window.innerWidth, 0),
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
				-(window.innerWidth - rect.right - margin - s.scrollAdjustment),
				0,
			);
		} else {
			window.scrollBy(0, rect.top - margin - s.scrollAdjustment);
		}
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

		document.documentElement.style.setProperty(
			"writing-mode",
			verticalMode ? "vertical-rl" : "horizontal-tb",
		);
		document.body.style.setProperty("background-color", theme.backgroundColor);

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
		for (const el of Array.from(
			contentEl.querySelectorAll("[data-ttu-spoiler-img]"),
		)) {
			const spoilerLabelEl = document.createElement("span");
			spoilerLabelEl.title = "Show Image";
			spoilerLabelEl.classList.add("spoiler-label");
			spoilerLabelEl.setAttribute("aria-hidden", "true");
			spoilerLabelEl.innerText = "ネタバレ";
			el.appendChild(spoilerLabelEl);
		}

		const handleContentClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target) return;

			const live = livePropsRef.current;
			const spoiler = target.closest("[data-ttu-spoiler-img]");
			if (spoiler && live.hideSpoilerImage) {
				spoiler.querySelector(".spoiler-label")?.remove();
				spoiler.removeAttribute("data-ttu-spoiler-img");
				spoiler.querySelector("img,image")?.classList.add("ttu-unspoilered");
				return;
			}

			if (
				live.hideFurigana &&
				(live.furiganaStyle === "Toggle" || live.furiganaStyle === "Full")
			) {
				const ruby = target.closest("ruby");
				if (ruby) {
					if (live.furiganaStyle === "Toggle") {
						ruby.classList.toggle("reveal-rt");
					} else {
						ruby.classList.add("reveal-rt");
					}
					return;
				}
			}

			const anchor = target.closest("a");
			if (anchor) {
				event.preventDefault();
				const href = anchor.getAttribute("href");
				if (href?.startsWith("#")) {
					navigateToSection(href.slice(1));
				}
			}
		};
		contentEl.addEventListener("click", handleContentClick);

		// Layout shifts from late image loads: recalculate paragraph positions
		// and keep the intended reading position stable.
		const scheduleRecalc = () => {
			clearTimeout(s.recalcTimer);
			s.recalcTimer = setTimeout(() => {
				if (cancelled) return;
				calculator.updateParagraphPos();
				const pos = calculator.getScrollPosByCharCount(s.prevIntendedCharCount);
				s.isProgrammaticScroll = true;
				s.pageManager?.scrollTo(pos);
				reportExplored();
				updateSectionProgress();
				refreshBookmarkMarker(s.displayedBookmark);
			}, 150);
		};
		const handleResourceLoad = () => scheduleRecalc();
		contentEl.addEventListener("load", handleResourceLoad, true);

		// Vertical mode: translate vertical wheel into horizontal page scroll
		const scrollFn = horizontalMouseWheel(
			4,
			document.documentElement,
			requestAnimationFrame,
		);
		const handleWheel = (ev: WheelEvent) => {
			if (verticalMode && !disableWheelNavigationRef.current) {
				scrollFn(ev, livePropsRef.current.fontSize, window.innerWidth);
			}
		};
		document.body.addEventListener("wheel", handleWheel, { passive: false });

		const finishInit = () => {
			if (cancelled) return;
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

			if (initialBookmark?.exploredCharCount) {
				s.isProgrammaticScroll = true;
				bookmarkManager.scrollToBookmark(initialBookmark);
				refreshBookmarkMarker(initialBookmark);
			}
			reportExplored();
			updateSectionProgress();
			setAllowDisplay(true);
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
			scrollToBookmark: (bookmark) => {
				s.isProgrammaticScroll = true;
				s.bookmarkManager?.scrollToBookmark(bookmark);
			},
			showBookmarkMarker: (bookmark) => refreshBookmarkMarker(bookmark),
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
						calculator.updateParagraphPos();
						const pos = calculator.getScrollPosByCharCount(
							s.prevIntendedCharCount,
						);
						s.isProgrammaticScroll = true;
						s.pageManager.scrollTo(pos);
						reportExplored();
						updateSectionProgress();
						refreshBookmarkMarker(s.displayedBookmark);
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
			document.documentElement.style.removeProperty("writing-mode");
			document.body.style.removeProperty("background-color");
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

				const explored = s.calculator.calcExploredCharCount();
				if (!s.isProgrammaticScroll && explored) {
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
		clearTimeout(s.resizeTimer);
		s.resizeTimer = setTimeout(() => {
			requestAnimationFrame(() => {
				if (!s.calculator || !s.pageManager) return;
				s.calculator.updateParagraphPos();
				if (autoPositionOnResize) {
					const pos = s.calculator.getScrollPosByCharCount(
						s.prevIntendedCharCount,
					);
					s.isProgrammaticScroll = true;
					s.pageManager.scrollTo(pos);
				}
				reportExplored();
				updateSectionProgress();
				refreshBookmarkMarker(s.displayedBookmark);
			});
		}, 100);
	});

	const maxHeight =
		verticalMode && secondDimensionMaxValue
			? secondDimensionMaxValue
			: undefined;
	const viewportSecondDimension =
		typeof window === "undefined" ? 0 : window.innerHeight;

	const containerStyle: CSSProperties = {
		color: theme.fontColor,
		fontSize: `${fontSize}px`,
		lineHeight: `${lineHeight}`,
		textOrientation: verticalTextOrientation,
		maxWidth:
			!verticalMode && secondDimensionMaxValue
				? `${secondDimensionMaxValue}px`
				: undefined,
		maxHeight: maxHeight ? `${maxHeight}px` : undefined,
		paddingLeft:
			verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		paddingRight:
			verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		paddingTop:
			!verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		paddingBottom:
			!verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		...({
			"--font-family-serif": fontFamilyGroupOne,
			"--font-family-sans-serif": fontFamilyGroupTwo,
			"--font-weight": fontWeight ?? undefined,
			"--book-content-hint-furigana-font-color": theme.hintFuriganaFontColor,
			"--book-content-hint-furigana-shadow-color":
				theme.hintFuriganaShadowColor,
			"--book-content-selection-font-color": theme.selectionFontColor,
			"--book-content-selection-background-color":
				theme.selectionBackgroundColor,
			"--book-content-child-height": `${maxHeight || viewportSecondDimension}px`,
			"--book-content-text-intendation": `${textIndentation ?? 0}rem`,
			"--book-content-text-margin": `${textMarginValue ?? 0}rem`,
		} as CSSProperties),
	};

	const containerClasses = [
		"book-content book-content--continuous m-auto",
		verticalMode
			? "book-content--writing-vertical-rl"
			: "book-content--writing-horizontal-tb",
		hideSpoilerImage ? "book-content--hide-spoiler-image" : "",
		hideFurigana
			? `book-content--hide-furigana book-content--furigana-style-${furiganaStyle.toLowerCase()}`
			: "",
		fontWeight ? "ttu-apply-font-weight" : "",
		prioritizeReaderStyles ? "ttu-apply-important" : "",
		enableTextJustification ? "ttu-apply-justification" : "",
		enableTextWrapPretty ? "ttu-text-wrap-pretty" : "",
		textMarginMode === "manual" ? "ttu-margin-manual" : "",
	]
		.filter(Boolean)
		.join(" ");

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
						<Bookmark className="size-5 fill-current" />
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
						<Bookmark className="size-5 fill-current" />
					</div>
				))}

			{!allowDisplay && (
				<div
					className="writing-horizontal-tb fixed inset-0 z-20 flex items-center justify-center"
					style={{
						color: theme.fontColor,
						backgroundColor: theme.backgroundColor,
					}}
				>
					<div className="size-12 animate-spin rounded-full border-2 border-current border-t-transparent" />
				</div>
			)}
		</>
	);
}
