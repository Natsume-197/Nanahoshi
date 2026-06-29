// React port of the ttu ebook reader paginated mode (BSD-3-Clause, ッツ Reader
// Authors). Only the current section is rendered (CSS columns in a fixed-size,
// overflow-hidden element), so opening a book never lays out the whole document.
// The parent remounts (via `key`) on layout-affecting setting changes.

import { Bookmark } from "lucide-react";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import { prependValue } from "@/lib/reader/epub/generate-epub-html";
import { refitImageWidths } from "@/lib/reader/image-dimensions";
import { PageManagerPaginated } from "@/lib/reader/page-manager-paginated";
import { SectionCharacterStatsCalculator } from "@/lib/reader/section-stats-calculator";
import { injectSpoilerLabels } from "@/lib/reader/shared/inject-spoiler-labels";
import { handleReaderContentClick } from "@/lib/reader/shared/reader-content-click";
import { applyReaderDocumentChrome } from "@/lib/reader/shared/reader-document-chrome";
import {
	buildReaderClasses,
	buildReaderStyle,
} from "@/lib/reader/shared/reader-style";
import type { ReaderBookmark } from "@/lib/reader/types";
import { viewportHeight, viewportWidth } from "@/lib/reader/viewport";
import { ReaderLoadingOverlay } from "./reader-loading-overlay";
import type { BaseReaderProps } from "./reader-shared-props";

const PAGE_GAP = 40;

interface BookReaderPaginatedProps extends BaseReaderProps {
	avoidPageBreak: boolean;
	pageColumns: number;
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
	/** Detached buffer holding a pre-parsed adjacent section (see stageSection). */
	stagingEl?: HTMLElement;
	stagedIndex: number;
	cancelStaging?: () => void;
}

function getHorizontalPadding() {
	if (typeof window === "undefined") return 0;
	return viewportWidth() >= 768 ? 32 : 16;
}

function computeViewport(
	verticalMode: boolean,
	firstDimensionMargin: number,
	secondDimensionMaxValue: number,
) {
	if (typeof window === "undefined") return { width: 0, height: 0 };

	const horizontalPadding = getHorizontalPadding();

	let width = viewportWidth() - horizontalPadding * 2;
	// No vertical padding: the text fills the whole screen height (the header
	// strip and footer are transparent overlays, not reserved bands).
	let height =
		viewportHeight() -
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
	avoidPageBreak,
	pageColumns,
	sections,
	initialPosition,
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
		previousIntendedCount: initialPosition?.exploredCharCount ?? 0,
		lastWheelAt: 0,
		stagedIndex: -1,
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

	// Reserved widths must track the max-height cap in reader.css, or the cap
	// engages and distorts images whose `width` attribute is already set.
	const refitImages = () => {
		const s = internalsRef.current;
		const height = viewportRef.current.height;
		if (!height) return;
		for (const sectionEl of s.sectionEls) {
			refitImageWidths(sectionEl as HTMLElement, height);
		}
		const contentEl = contentElRef.current;
		if (contentEl) refitImageWidths(contentEl, height);
		s.cancelStaging?.();
		s.stagedIndex = -1;
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

	// Pre-parse + decode images off-DOM so section crossings paint instantly.
	const stageSection = (index: number) => {
		const s = internalsRef.current;
		const section = s.sectionEls[index];
		if (!s.stagingEl || !section || s.stagedIndex === index) return;

		s.stagingEl.innerHTML = section.innerHTML;
		injectSpoilerLabels(s.stagingEl, document);
		s.stagedIndex = index;
		for (const img of Array.from(s.stagingEl.querySelectorAll("img"))) {
			img.decode().catch(() => {});
		}
	};

	const scheduleAdjacentStaging = (index: number, direction: 1 | -1) => {
		const s = internalsRef.current;
		const target = s.sectionEls[index + direction]
			? index + direction
			: index - direction;
		s.cancelStaging?.();
		if (!s.sectionEls[target]) return;

		if (typeof requestIdleCallback === "function") {
			const handle = requestIdleCallback(() => stageSection(target), {
				timeout: 2000,
			});
			s.cancelStaging = () => cancelIdleCallback(handle);
		} else {
			const handle = setTimeout(() => stageSection(target), 300);
			s.cancelStaging = () => clearTimeout(handle);
		}
	};

	const renderSection = (index: number, onRendered?: () => void) => {
		const s = internalsRef.current;
		const contentEl = contentElRef.current;
		const section = s.sectionEls[index];
		if (!contentEl || !section) return;

		const previousIndex = s.sectionIndex;
		s.sectionIndex = index;
		s.pageManager?.clearTranslate();
		s.virtualScrollPos = 0;
		scrollElRef.current?.scrollTo({ top: 0, left: 0 });

		if (s.stagedIndex === index && s.stagingEl) {
			// moving (not re-parsing) keeps the staged nodes' decoded images
			contentEl.replaceChildren(...Array.from(s.stagingEl.childNodes));
		} else {
			contentEl.innerHTML = section.innerHTML;
		}
		s.stagedIndex = -1;
		contentEl.id = section.id?.startsWith(prependValue) ? section.id : "";

		injectSpoilerLabels(contentEl, document);

		s.calculator?.updateCurrentSection(index);

		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				s.calculator?.updateParagraphPos();
				reportExplored();
				updateBookmarkScreen();
				onRendered?.();
				scheduleAdjacentStaging(index, index >= previousIndex ? 1 : -1);
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

		const cleanupChrome = applyReaderDocumentChrome({
			mode: "paginated",
			verticalMode,
			backgroundColor: theme.backgroundColor,
		});

		const tempContainer = document.createElement("div");
		tempContainer.innerHTML = htmlContent;
		s.sectionEls = Array.from(tempContainer.children);
		s.stagingEl = document.createElement("div");

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

		const handleContentClick = (event: MouseEvent) =>
			handleReaderContentClick(event, livePropsRef.current, navigateToSection);
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

			// load-time widths assume a full-height page
			refitImages();

			const charCount = initialPosition?.exploredCharCount ?? 0;
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
				}
				if (initialBookmark?.exploredCharCount) {
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
			// Paginated mode never shows a document scrollbar (body is
			// overflow-hidden), so there is nothing to hide.
			setScrollbarHidden: () => {},
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
						refitImages();
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
			s.cancelStaging?.();
			s.stagingEl?.replaceChildren();
			s.stagedIndex = -1;
			contentEl.removeEventListener("click", handleContentClick);
			contentEl.removeEventListener("load", handleResourceLoad, true);
			contentEl.innerHTML = "";
			document.body.removeEventListener("wheel", handleWheel);
			cleanupChrome();
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
				refitImages();
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
		maxWidth: width ? `${width}px` : undefined,
		maxHeight: verticalMode && height ? `${height}px` : undefined,
		...({
			"--book-content-child-width": `${width}px`,
			"--book-content-child-height": `${height}px`,
			"--book-content-child-column-width":
				!verticalMode && columnCount === 1 ? `${width}px` : "",
			"--book-content-column-count": columnCount,
			"--book-content-image-max-width": `${
				verticalMode ? width : (width + PAGE_GAP) / columnCount - PAGE_GAP
			}px`,
		} as CSSProperties),
	};

	const scrollElClasses = buildReaderClasses({
		mode: "paginated",
		verticalMode,
		hideSpoilerImage,
		hideFurigana,
		furiganaStyle,
		fontWeight,
		prioritizeReaderStyles,
		enableTextJustification,
		enableTextWrapPretty,
		textMarginMode,
		avoidPageBreak,
	});

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

			{!allowDisplay && <ReaderLoadingOverlay theme={theme} />}
		</>
	);
}
