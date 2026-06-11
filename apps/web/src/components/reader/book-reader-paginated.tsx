/**
 * React port of the ttu ebook reader paginated mode
 * (BSD-3-Clause, ッツ Reader Authors).
 *
 * Only the current section is rendered (CSS columns inside a fixed-size,
 * overflow-hidden scroll element), so opening a book never lays out the
 * whole document. The parent remounts this component (via `key`) whenever a
 * layout-affecting setting changes.
 */

import { Bookmark } from "lucide-react";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import { prependValue } from "@/lib/reader/epub/generate-epub-html";
import {
	PageManagerPaginated,
	type SectionWithProgress,
} from "@/lib/reader/page-manager-paginated";
import { SectionCharacterStatsCalculator } from "@/lib/reader/section-stats-calculator";
import type {
	FuriganaStyle,
	ReaderTheme,
	TextMarginMode,
	VerticalTextOrientation,
} from "@/lib/reader/settings";
import type { ReaderBookmark, Section } from "@/lib/reader/types";
import type { BookReaderApi } from "./book-reader-continuous";

const PAGE_GAP = 40;

interface BookReaderPaginatedProps {
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
	avoidPageBreak: boolean;
	pageColumns: number;
	sections: Section[];
	initialBookmark: ReaderBookmark | undefined;
	onExploredCharCountChange: (count: number) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	apiRef: (api: BookReaderApi | null) => void;
}

interface PaginatedInternals {
	sectionEls: Element[];
	calculator?: SectionCharacterStatsCalculator;
	pageManager?: PageManagerPaginated;
	sectionIndex: number;
	virtualScrollPos: number;
	previousIntendedCount: number;
	displayedBookmark?: ReaderBookmark;
	recalcTimer?: ReturnType<typeof setTimeout>;
	resizeTimer?: ReturnType<typeof setTimeout>;
	lastWheelAt: number;
}

function getHorizontalPadding() {
	if (typeof window === "undefined") return 0;
	return window.innerWidth >= 768 ? 32 : 16;
}

function computeViewport(
	verticalMode: boolean,
	firstDimensionMargin: number,
	secondDimensionMaxValue: number,
) {
	if (typeof window === "undefined") return { width: 0, height: 0 };

	const horizontalPadding = getHorizontalPadding();

	let width = window.innerWidth - horizontalPadding * 2;
	// No vertical padding: the text fills the whole screen height (the header
	// strip and footer are transparent overlays, not reserved bands).
	let height =
		window.innerHeight -
		(!verticalMode && firstDimensionMargin ? firstDimensionMargin * 2 : 0);

	if (!verticalMode && secondDimensionMaxValue) {
		width = Math.min(secondDimensionMaxValue, width);
	}
	if (verticalMode && secondDimensionMaxValue) {
		height = Math.min(secondDimensionMaxValue, height);
	}
	return { width, height };
}

export function BookReaderPaginated({
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
	avoidPageBreak,
	pageColumns,
	sections,
	initialBookmark,
	onExploredCharCountChange,
	onSectionProgressChange,
	apiRef,
}: BookReaderPaginatedProps) {
	const scrollElRef = useRef<HTMLDivElement | null>(null);
	const contentElRef = useRef<HTMLDivElement | null>(null);
	const internalsRef = useRef<PaginatedInternals>({
		sectionEls: [],
		sectionIndex: 0,
		virtualScrollPos: 0,
		previousIntendedCount: initialBookmark?.exploredCharCount ?? 0,
		lastWheelAt: 0,
	});
	const [allowDisplay, setAllowDisplay] = useState(false);
	const [isBookmarkScreen, setIsBookmarkScreen] = useState(false);
	const [bookmarkMarkerStyle, setBookmarkMarkerStyle] = useState<{
		top?: string;
		left?: string;
		right?: string;
	}>({});
	const [resizeTick, setResizeTick] = useState(0);
	// Viewport depends on live settings (margins/max size) and window size.
	// biome-ignore lint/correctness/useExhaustiveDependencies: resizeTick re-reads the window size
	const viewport = useMemo(
		() =>
			computeViewport(
				verticalMode,
				firstDimensionMargin,
				secondDimensionMaxValue,
			),
		[verticalMode, firstDimensionMargin, secondDimensionMaxValue, resizeTick],
	);
	const viewportRef = useRef(viewport);
	viewportRef.current = viewport;
	const horizontalPadding = getHorizontalPadding();

	const onExploredChangeRef = useRef(onExploredCharCountChange);
	onExploredChangeRef.current = onExploredCharCountChange;
	const onSectionProgressChangeRef = useRef(onSectionProgressChange);
	onSectionProgressChangeRef.current = onSectionProgressChange;
	const disableWheelNavigationRef = useRef(disableWheelNavigation);
	disableWheelNavigationRef.current = disableWheelNavigation;
	// Live settings read by long-lived DOM handlers (no remount on change).
	const livePropsRef = useRef({
		hideFurigana,
		furiganaStyle,
		hideSpoilerImage,
	});
	livePropsRef.current = { hideFurigana, furiganaStyle, hideSpoilerImage };

	const reportExplored = () => {
		const s = internalsRef.current;
		if (!s.calculator) return;
		const explored = s.calculator.calcExploredCharCount();
		onExploredChangeRef.current(Math.max(0, explored));
	};

	// ttu's updateBookmarkScreen: places the marker next to the bookmarked
	// paragraph when its exact page is shown, with edge fallbacks otherwise.
	const updateBookmarkScreen = () => {
		const s = internalsRef.current;
		const scrollEl = scrollElRef.current;
		const charCount = s.displayedBookmark?.exploredCharCount;
		if (!s.calculator || !charCount || !scrollEl) {
			setIsBookmarkScreen(false);
			return;
		}
		const result = s.calculator.checkBookmarkOnScreen(charCount);
		setIsBookmarkScreen(result.isBookmarkScreen);
		if (!result.isBookmarkScreen) return;

		const dimensionAdjustment = Number(
			getComputedStyle(scrollEl)[
				verticalMode ? "marginTop" : "marginRight"
			].replace(/px$/, ""),
		);
		const pos = result.bookmarkPos;
		if (!pos) {
			setBookmarkMarkerStyle(
				verticalMode
					? { top: "0.5rem", right: "0.75rem" }
					: { top: "0.5rem", left: "0.75rem" },
			);
		} else if (verticalMode) {
			setBookmarkMarkerStyle({
				top: dimensionAdjustment ? `${dimensionAdjustment}px` : "0.5rem",
				left: `${pos.left ?? 0}px`,
			});
		} else {
			setBookmarkMarkerStyle({
				top: `${pos.top ?? 0}px`,
				left:
					(pos.left ?? 0) > 0
						? `calc(${pos.left}px - 20px)`
						: `${Math.max(20, dimensionAdjustment)}px`,
			});
		}
	};

	const renderSection = (index: number, onRendered?: () => void) => {
		const s = internalsRef.current;
		const contentEl = contentElRef.current;
		const section = s.sectionEls[index];
		if (!contentEl || !section) return;

		s.sectionIndex = index;
		s.pageManager?.clearTranslate();
		s.virtualScrollPos = 0;
		scrollElRef.current?.scrollTo({ top: 0, left: 0 });

		contentEl.innerHTML = section.innerHTML;
		contentEl.id = section.id?.startsWith(prependValue) ? section.id : "";

		// Labels added unconditionally — CSS only shows them under the
		// hide-spoiler class, so toggling the setting later just works.
		for (const el of Array.from(
			contentEl.querySelectorAll("[data-ttu-spoiler-img]"),
		)) {
			if (el.querySelector(".spoiler-label")) continue;
			const spoilerLabelEl = document.createElement("span");
			spoilerLabelEl.title = "Show Image";
			spoilerLabelEl.classList.add("spoiler-label");
			spoilerLabelEl.setAttribute("aria-hidden", "true");
			spoilerLabelEl.innerText = "ネタバレ";
			el.appendChild(spoilerLabelEl);
		}

		s.calculator?.updateCurrentSection(index);

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				s.calculator?.updateParagraphPos();
				reportExplored();
				updateBookmarkScreen();
				onRendered?.();
			});
		});
	};

	const navigateToSection = (reference: string) => {
		const s = internalsRef.current;
		const targetIndex = s.sectionEls.findIndex(
			(section) =>
				section.id === reference ||
				section.querySelector(`[id="${reference}"]`),
		);
		if (targetIndex === -1) return;

		renderSection(targetIndex, () => {
			s.pageManager?.scrollTo(0, true);
		});
	};

	useMountEffect(() => {
		const scrollEl = scrollElRef.current;
		const contentEl = contentElRef.current;
		if (!scrollEl || !contentEl) return;

		const s = internalsRef.current;
		let cancelled = false;

		document.documentElement.style.setProperty(
			"writing-mode",
			verticalMode ? "vertical-rl" : "horizontal-tb",
		);
		document.body.style.setProperty("background-color", theme.backgroundColor);
		document.body.classList.add("overflow-hidden");

		const tempContainer = document.createElement("div");
		tempContainer.innerHTML = htmlContent;
		s.sectionEls = Array.from(tempContainer.children);

		const calculator = new SectionCharacterStatsCalculator(
			contentEl,
			s.sectionEls,
			() => s.virtualScrollPos,
			() => viewportRef.current.width,
			() => viewportRef.current.height,
			() => PAGE_GAP,
			verticalMode,
			scrollEl,
			document,
		);
		s.calculator = calculator;

		const pageManager = new PageManagerPaginated(
			contentEl,
			scrollEl,
			s.sectionEls,
			sections,
			() => viewportRef.current.width,
			() => viewportRef.current.height,
			PAGE_GAP,
			verticalMode,
			{
				getVirtualScrollPos: () => s.virtualScrollPos,
				setVirtualScrollPos: (pos) => {
					s.virtualScrollPos = pos;
				},
				getSectionIndex: () => s.sectionIndex,
				requestSection: (index, onRendered) => renderSection(index, onRendered),
				onPageChange: (isUser) => {
					if (!s.calculator) return;
					const explored = Math.max(0, s.calculator.calcExploredCharCount());
					if (isUser) {
						s.previousIntendedCount = explored;
					}
					onExploredChangeRef.current(explored);
					updateBookmarkScreen();
				},
				onSectionProgress: (progress) =>
					onSectionProgressChangeRef.current(progress),
			},
		);
		s.pageManager = pageManager;

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

		// Late image loads reflow the columns: re-measure and keep position.
		const handleResourceLoad = () => {
			clearTimeout(s.recalcTimer);
			s.recalcTimer = setTimeout(() => {
				if (cancelled || !s.calculator || !s.pageManager) return;
				s.calculator.updateParagraphPos();
				const pos = s.calculator.getScrollPosByCharCount(
					s.previousIntendedCount,
				);
				if (pos >= 0) {
					s.pageManager.scrollTo(pos, false);
				}
				reportExplored();
			}, 150);
		};
		contentEl.addEventListener("load", handleResourceLoad, true);

		// Wheel flips pages (ttu: throttled, passive)
		const handleWheel = (ev: WheelEvent) => {
			if (disableWheelNavigationRef.current) return;
			const now = Date.now();
			if (now - s.lastWheelAt < 50) return;
			s.lastWheelAt = now;

			let multiplier = (ev.deltaX < 0 ? -1 : 1) * (verticalMode ? -1 : 1);
			if (!ev.deltaX) {
				multiplier = ev.deltaY < 0 ? -1 : 1;
			}
			s.pageManager?.flipPage(multiplier as -1 | 1);
		};
		document.body.addEventListener("wheel", handleWheel, { passive: true });

		const finishInit = () => {
			if (cancelled) return;

			const charCount = initialBookmark?.exploredCharCount ?? 0;
			const startIndex = charCount
				? calculator.getSectionIndexByCharCount(charCount)
				: 0;

			renderSection(startIndex, () => {
				if (charCount) {
					const pos = calculator.getScrollPosByCharCount(charCount);
					if (pos >= 0) {
						pageManager.scrollTo(pos, false);
					}
					s.previousIntendedCount = charCount;
					s.displayedBookmark = initialBookmark;
					updateBookmarkScreen();
				}
				reportExplored();
				setAllowDisplay(true);
			});
		};

		document.fonts.ready.then(() => {
			requestAnimationFrame(finishInit);
		});

		apiRef({
			nextPage: () => pageManager.flipPage(1),
			prevPage: () => pageManager.flipPage(-1),
			navigateToSection,
			toggleAutoScroll: () => {},
			setAutoScrollMultiplier: () => {},
			getBookmark: () => {
				const exploredCharCount = Math.max(
					0,
					calculator.calcExploredCharCount(),
				);
				return {
					exploredCharCount,
					progress: calculator.charCount
						? exploredCharCount / calculator.charCount
						: 0,
					lastBookmarkModified: Date.now(),
				};
			},
			scrollToBookmark: (bookmark) => {
				const target = bookmark.exploredCharCount;
				if (!target) return;
				s.displayedBookmark = bookmark;
				const index = calculator.getSectionIndexByCharCount(target);
				const scroll = () => {
					const pos = calculator.getScrollPosByCharCount(target);
					if (pos >= 0) {
						pageManager.scrollTo(pos, false);
					}
					s.previousIntendedCount = target;
					updateBookmarkScreen();
				};
				if (s.sectionIndex === index) {
					scroll();
				} else {
					renderSection(index, scroll);
				}
			},
			showBookmarkMarker: (bookmark) => {
				s.displayedBookmark = bookmark;
				updateBookmarkScreen();
			},
			relayout: () => {
				document.fonts.ready.then(() => {
					requestAnimationFrame(() => {
						if (cancelled || !s.calculator || !s.pageManager) return;
						s.pageManager.scrollTo(0, false);
						s.calculator.updateParagraphPos();
						const pos = s.calculator.getScrollPosByCharCount(
							s.previousIntendedCount,
						);
						if (pos >= 0) {
							s.pageManager.scrollTo(pos, false);
						}
						reportExplored();
						updateBookmarkScreen();
					});
				});
			},
		});

		return () => {
			cancelled = true;
			clearTimeout(s.recalcTimer);
			clearTimeout(s.resizeTimer);
			contentEl.removeEventListener("click", handleContentClick);
			contentEl.removeEventListener("load", handleResourceLoad, true);
			contentEl.innerHTML = "";
			document.body.removeEventListener("wheel", handleWheel);
			document.body.classList.remove("overflow-hidden");
			document.documentElement.style.removeProperty("writing-mode");
			document.body.style.removeProperty("background-color");
			apiRef(null);
		};
	});

	useWindowEvent("resize", () => {
		const s = internalsRef.current;
		clearTimeout(s.resizeTimer);
		s.resizeTimer = setTimeout(() => {
			setResizeTick((tick) => tick + 1);
			requestAnimationFrame(() => {
				if (!s.calculator || !s.pageManager) return;
				s.pageManager.scrollTo(0, false);
				s.calculator.updateParagraphPos();
				const pos = s.calculator.getScrollPosByCharCount(
					s.previousIntendedCount,
				);
				if (pos >= 0) {
					s.pageManager.scrollTo(pos, false);
				}
				reportExplored();
			});
		}, 100);
	});

	const { width, height } = viewport;
	const columnCount = verticalMode ? 1 : pageColumns || Math.ceil(width / 1000);

	const scrollElStyle: CSSProperties = {
		color: theme.fontColor,
		fontSize: `${fontSize}px`,
		lineHeight: `${lineHeight}`,
		textOrientation: verticalTextOrientation,
		paddingTop:
			!verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		paddingBottom:
			!verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		paddingLeft:
			verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		paddingRight:
			verticalMode && firstDimensionMargin
				? `${firstDimensionMargin}px`
				: undefined,
		maxWidth: width ? `${width}px` : undefined,
		maxHeight: verticalMode && height ? `${height}px` : undefined,
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
			"--book-content-child-width": `${width}px`,
			"--book-content-child-height": `${height}px`,
			"--book-content-child-column-width":
				!verticalMode && columnCount === 1 ? `${width}px` : "",
			"--book-content-column-count": columnCount,
			"--book-content-image-max-width": `${
				verticalMode ? width : (width + PAGE_GAP) / columnCount - PAGE_GAP
			}px`,
			"--book-content-text-margin": `${textMarginValue ?? 0}rem`,
			"--book-content-text-intendation": `${textIndentation ?? 0}rem`,
		} as CSSProperties),
	};

	const scrollElClasses = [
		"book-content book-content--paginated m-auto",
		verticalMode
			? "book-content--writing-vertical-rl"
			: "book-content--writing-horizontal-tb",
		avoidPageBreak ? "book-content--avoid-page-break" : "",
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

	return (
		<>
			{/* Physical padding: Tailwind px-* is logical (padding-inline) and
			    under vertical-rl it becomes vertical padding, shrinking the
			    page height and breaking the column math. */}
			<div
				style={{
					paddingLeft: `${horizontalPadding}px`,
					paddingRight: `${horizontalPadding}px`,
				}}
			>
				<div
					ref={scrollElRef}
					className={scrollElClasses}
					style={scrollElStyle}
				>
					<div ref={contentElRef} className="book-content-container" />
				</div>
			</div>

			{isBookmarkScreen && (
				<div
					className="pointer-events-none fixed text-base opacity-25 sm:text-xl"
					style={{ color: theme.fontColor, ...bookmarkMarkerStyle }}
				>
					<Bookmark className="size-5 fill-current" />
				</div>
			)}

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
