// React port of the ttu ebook reader paginated mode (BSD-3-Clause, ッツ Reader
// Authors). Only the current section is rendered (CSS columns in a fixed-size,
// overflow-hidden element), so opening a book never lays out the whole document.
// The parent remounts (via `key`) on layout-affecting setting changes.

import { BookmarkSimple } from "@phosphor-icons/react";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import { refitImageWidths } from "@/lib/reader/image-dimensions";
import { mergeImageOnlySectionRuns } from "@/lib/reader/merge-image-sections";
import { PageManagerPaginated } from "@/lib/reader/page-manager-paginated";
import { SectionCharacterStatsCalculator } from "@/lib/reader/section-stats-calculator";
import { handleReaderContentClick } from "@/lib/reader/shared/reader-content-click";
import { applyReaderDocumentChrome } from "@/lib/reader/shared/reader-document-chrome";
import {
	buildReaderClasses,
	buildReaderStyle,
} from "@/lib/reader/shared/reader-style";
import { resolveReaderTextAnchorOffset } from "@/lib/reader/text-anchor";
import {
	type ReaderBookmark,
	type ReaderTextAnchor,
	SECTION_REFERENCE_PREFIX,
} from "@/lib/reader/types";
import {
	readerColumnHeightCss,
	viewportHeight,
	viewportWidth,
} from "@/lib/reader/viewport";
import { ReaderLoadingOverlay } from "./reader-loading-overlay";
import type { BaseReaderProps } from "./reader-shared-props";

const PAGE_GAP = 40;
const TOUCH_PAGE_FLIP_THRESHOLD = 40;

interface BookReaderPaginatedProps extends BaseReaderProps {
	avoidPageBreak: boolean;
	pageColumns: number;
	reservePlayerSpace: boolean;
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
	relayoutTimer?: ReturnType<typeof setTimeout>;
	lastWheelAt: number;
	/** Swipe origin for touch page-flips (mobile has no wheel/keyboard). */
	touchStartX: number;
	touchStartY: number;
	/** Small detached cache for the previous and next pre-parsed sections. */
	preparedSections: Map<number, PreparedSection>;
	cancelStaging?: () => void;
	/** Invalidates async renders and late resource callbacks from older sections. */
	renderGeneration: number;
}

interface PreparedSection {
	container: HTMLElement;
	resourcesReady: Promise<void>;
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

	let width =
		viewportWidth() -
		horizontalPadding * 2 -
		(verticalMode && firstDimensionMargin ? firstDimensionMargin * 2 : 0);
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

export function getPaginatedPageHeight(
	viewportHeightPx: number,
	reservePlayerSpace: boolean,
) {
	return reservePlayerSpace
		? `max(0px, calc(${viewportHeightPx}px - var(--reader-player-reserve-current)))`
		: `${viewportHeightPx}px`;
}

function waitForImageDecode(image: HTMLImageElement): Promise<void> {
	if (typeof image.decode === "function") {
		return image.decode();
	}
	if (image.complete) return Promise.resolve();
	return new Promise((resolve) => {
		image.addEventListener("load", () => resolve(), { once: true });
		image.addEventListener("error", () => resolve(), { once: true });
	});
}

/**
 * A fixed-layout EPUB usually stores artwork as `<svg><image href="…">`.
 * `HTMLImageElement.decode()` cannot be called on the SVG node, so decode the
 * nested resource through a short-lived HTML image before the section becomes
 * visible. Waiting here also makes `scrollWidth` safe for backward pagination.
 */
async function waitForSectionImageResources(
	container: HTMLElement,
	document: Document,
): Promise<void> {
	const imageDecodes = Array.from(container.querySelectorAll("img")).map(
		(img) => {
			img.loading = "eager";
			return waitForImageDecode(img);
		},
	);
	const svgResourceHrefs = new Set(
		Array.from(container.querySelectorAll("svg image"))
			.map(
				(image) =>
					image.getAttribute("href") ??
					image.getAttributeNS("http://www.w3.org/1999/xlink", "href"),
			)
			.filter(
				(href): href is string => Boolean(href) && !href?.startsWith("#"),
			),
	);
	for (const href of svgResourceHrefs) {
		const image = document.createElement("img");
		image.loading = "eager";
		image.src = href;
		imageDecodes.push(waitForImageDecode(image));
	}
	const allResourcesReady = Promise.allSettled(imageDecodes);
	// Text chapters can contain artwork dozens of pages ahead. Their dimensions
	// are already reserved at format time, so decoding every image must not hold
	// the chapter transition. Image-only sections are the exception: displaying
	// them before decode is exactly the blank-page race this boundary prevents.
	const isImageOnly =
		imageDecodes.length > 0 &&
		(container.textContent?.replace(/\s/gu, "").length ?? 0) === 0;
	if (isImageOnly) {
		await allResourcesReady;
	} else {
		void allResourcesReady;
	}
}

export function BookReaderPaginated({
	htmlContent,
	language,
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
	disableWheelNavigation,
	navigationBlocked,
	avoidPageBreak,
	pageColumns,
	reservePlayerSpace,
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
		touchStartX: Number.NaN,
		touchStartY: Number.NaN,
		preparedSections: new Map(),
		renderGeneration: 0,
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
	const navigationBlockedRef = useRef(navigationBlocked);
	navigationBlockedRef.current = navigationBlocked;
	// Live settings read by long-lived DOM handlers (no remount on change).
	const livePropsRef = useRef({
		hideFurigana,
		furiganaStyle,
	});
	livePropsRef.current = { hideFurigana, furiganaStyle };

	const reportExplored = (intendedCount?: number) => {
		const s = internalsRef.current;
		if (!s.calculator) return;
		const explored =
			intendedCount ?? s.calculator.calcPreciseExploredCharCount();
		onExploredChangeRef.current(Math.max(0, explored));
	};

	const clearPreparedSections = () => {
		const s = internalsRef.current;
		s.cancelStaging?.();
		s.cancelStaging = undefined;
		for (const prepared of s.preparedSections.values()) {
			prepared.container.replaceChildren();
		}
		s.preparedSections.clear();
	};

	// Reserved widths must track the max-height cap in reader.css, or the cap
	// engages and distorts images whose `width` attribute is already set.
	const refitImages = () => {
		const s = internalsRef.current;
		const height =
			contentElRef.current?.clientHeight || viewportRef.current.height;
		if (!height) return;
		for (const sectionEl of s.sectionEls) {
			refitImageWidths(sectionEl as HTMLElement, height);
		}
		for (const prepared of s.preparedSections.values()) {
			refitImageWidths(prepared.container, height);
		}
		const contentEl = contentElRef.current;
		if (contentEl) refitImageWidths(contentEl, height);
		s.cancelStaging?.();
		s.cancelStaging = undefined;
	};

	// ttu's updateBookmarkScreen: places the marker next to the bookmarked
	// paragraph when its exact page is shown, with edge fallbacks otherwise.
	const updateBookmarkScreen = () => {
		const s = internalsRef.current;
		const scrollEl = scrollElRef.current;
		const charCount = s.displayedBookmark?.exploredCharCount;
		// Count 0 (bookmark at the book start) is valid; only no-bookmark hides.
		if (!s.calculator || charCount === undefined || !scrollEl) {
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

	// Re-measures the current section and re-anchors to the last user-intended
	// reading position.
	const relayoutNow = () => {
		const s = internalsRef.current;
		if (!s.calculator || !s.pageManager) return;
		refitImages();
		s.pageManager.scrollTo(0, false);
		s.calculator.updateParagraphPos();
		const pos = s.calculator.getScrollPosByCharCount(s.previousIntendedCount);
		if (pos >= 0) {
			s.pageManager.scrollTo(pos, false);
		}
		reportExplored(s.previousIntendedCount);
		updateBookmarkScreen();
	};

	// Debounced: the quick-settings sliders commit one layout change per drag
	// tick, and re-measuring every paragraph on each tick freezes the drag.
	// Only the last tick's layout matters; the timer also guarantees React has
	// committed the new layout props before anything is measured.
	const scheduleRelayout = (position?: ReaderBookmark) => {
		const s = internalsRef.current;
		if (position) s.previousIntendedCount = position.exploredCharCount;
		clearTimeout(s.relayoutTimer);
		s.relayoutTimer = setTimeout(() => {
			document.fonts.ready.then(() => {
				requestAnimationFrame(relayoutNow);
			});
		}, 100);
	};

	// Pre-parse + decode images off-DOM so section crossings paint instantly.
	const prepareSection = (index: number): PreparedSection | undefined => {
		const s = internalsRef.current;
		const section = s.sectionEls[index];
		if (!section) return undefined;
		const existing = s.preparedSections.get(index);
		if (existing) return existing;

		const container = document.createElement("div");
		container.innerHTML = section.innerHTML;
		const prepared = {
			container,
			resourcesReady: waitForSectionImageResources(container, document),
		};
		s.preparedSections.set(index, prepared);
		return prepared;
	};

	const scheduleAdjacentStaging = (index: number) => {
		const s = internalsRef.current;
		const targets = [index - 1, index + 1].filter((target) =>
			Boolean(s.sectionEls[target]),
		);
		s.cancelStaging?.();
		for (const [preparedIndex, prepared] of s.preparedSections) {
			if (targets.includes(preparedIndex)) continue;
			prepared.container.replaceChildren();
			s.preparedSections.delete(preparedIndex);
		}
		if (!targets.length) return;

		const stageTargets = () => {
			for (const target of targets) prepareSection(target);
		};

		if (typeof requestIdleCallback === "function") {
			const handle = requestIdleCallback(stageTargets, {
				timeout: 2000,
			});
			s.cancelStaging = () => cancelIdleCallback(handle);
		} else {
			const handle = setTimeout(stageTargets, 300);
			s.cancelStaging = () => clearTimeout(handle);
		}
	};

	const renderSection = (index: number, onRendered?: () => void) => {
		const s = internalsRef.current;
		const contentEl = contentElRef.current;
		const section = s.sectionEls[index];
		if (!contentEl || !section) return;

		const generation = ++s.renderGeneration;
		const prepared = prepareSection(index);
		if (!prepared) return;

		void prepared.resourcesReady.then(() => {
			if (generation !== s.renderGeneration) {
				if (s.preparedSections.get(index) !== prepared) {
					prepared.container.replaceChildren();
				}
				return;
			}
			if (s.preparedSections.get(index) === prepared) {
				s.preparedSections.delete(index);
			}

			s.sectionIndex = index;
			s.pageManager?.clearTranslate();
			s.virtualScrollPos = 0;
			scrollElRef.current?.scrollTo({ top: 0, left: 0 });
			// Moving the prepared nodes preserves decoded <img> instances; SVG
			// resources were decoded through HTML image proxies above.
			contentEl.replaceChildren(...Array.from(prepared.container.childNodes));
			contentEl.id = section.id?.startsWith(SECTION_REFERENCE_PREFIX)
				? section.id
				: "";
			s.calculator?.updateCurrentSection(index);

			// Geometry reads below synchronously lay out the decoded section. Keep
			// replacement, measurement, and the destination-page scroll in one task:
			// yielding to animation frames here briefly paints page zero while a
			// backwards transition is trying to land on the section's last page.
			s.calculator?.updateParagraphPos();
			reportExplored();
			updateBookmarkScreen();
			onRendered?.();
			scheduleAdjacentStaging(index);
		});
	};

	const findSectionIndex = (reference: string) =>
		internalsRef.current.sectionEls.findIndex(
			(section) =>
				section.id === reference ||
				section.querySelector(`[id="${reference}"]`),
		);

	const navigateToSection = (reference: string) => {
		const s = internalsRef.current;
		const targetIndex = findSectionIndex(reference);
		if (targetIndex === -1) return;

		renderSection(targetIndex, () => {
			s.pageManager?.scrollTo(0, true);
		});
	};

	const resolveTextAnchor = (anchor: ReaderTextAnchor) => {
		const s = internalsRef.current;
		const sectionIndex = findSectionIndex(anchor.sectionReference);
		const section = s.sectionEls[sectionIndex];
		if (sectionIndex < 0 || !section || !s.calculator) return undefined;
		const sectionOffset = resolveReaderTextAnchorOffset(section, anchor);
		return sectionOffset === undefined
			? undefined
			: s.calculator.getSectionStartCharCount(sectionIndex) + sectionOffset;
	};

	const navigateToTextAnchor = (anchor: ReaderTextAnchor) => {
		const s = internalsRef.current;
		const sectionIndex = findSectionIndex(anchor.sectionReference);
		const targetCharacter = resolveTextAnchor(anchor);
		if (sectionIndex < 0 || targetCharacter === undefined) {
			navigateToSection(anchor.sectionReference);
			return;
		}

		const scrollToAnchor = () => {
			const position = s.calculator?.getScrollPosByCharCount(targetCharacter);
			if (position === undefined || position < 0) return;
			s.previousIntendedCount = targetCharacter;
			s.pageManager?.scrollTo(position, false);
			reportExplored(targetCharacter);
			updateBookmarkScreen();
		};
		if (s.sectionIndex === sectionIndex) {
			scrollToAnchor();
		} else {
			renderSection(sectionIndex, scrollToAnchor);
		}
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
		// Vertical mode is always single-column, so runs stay one per page there.
		s.sectionEls = verticalMode
			? Array.from(tempContainer.children)
			: mergeImageOnlySectionRuns(Array.from(tempContainer.children), document);

		const calculator = new SectionCharacterStatsCalculator(
			contentEl,
			s.sectionEls,
			() => s.virtualScrollPos,
			() => viewportRef.current.width,
			() => contentEl.clientHeight || viewportRef.current.height,
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
			() => contentEl.clientHeight || viewportRef.current.height,
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
					const explored = Math.max(
						0,
						isUser
							? s.calculator.calcPreciseExploredCharCount()
							: s.calculator.calcExploredCharCount(),
					);
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
			const generation = s.renderGeneration;
			const sectionIndex = s.sectionIndex;
			clearTimeout(s.recalcTimer);
			s.recalcTimer = setTimeout(() => {
				if (
					cancelled ||
					generation !== s.renderGeneration ||
					sectionIndex !== s.sectionIndex ||
					!s.calculator ||
					!s.pageManager
				) {
					return;
				}
				s.calculator.updateParagraphPos();
				const pos = s.calculator.getScrollPosByCharCount(
					s.previousIntendedCount,
				);
				if (pos >= 0) {
					s.pageManager.scrollTo(pos, false);
				}
				reportExplored(s.previousIntendedCount);
			}, 150);
		};
		contentEl.addEventListener("load", handleResourceLoad, true);

		// Wheel flips pages (ttu: throttled, passive)
		const handleWheel = (ev: WheelEvent) => {
			if (disableWheelNavigationRef.current || navigationBlockedRef.current) {
				return;
			}
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

		const handleTouchStart = (ev: TouchEvent) => {
			if (navigationBlockedRef.current || ev.touches.length !== 1) {
				s.touchStartX = Number.NaN;
				s.touchStartY = Number.NaN;
				return;
			}
			const touch = ev.touches[0];
			s.touchStartX = touch.clientX;
			s.touchStartY = touch.clientY;
		};

		const handleTouchEnd = (ev: TouchEvent) => {
			if (navigationBlockedRef.current) {
				s.touchStartX = Number.NaN;
				s.touchStartY = Number.NaN;
				return;
			}
			if (Number.isNaN(s.touchStartX) || Number.isNaN(s.touchStartY)) return;

			const startX = s.touchStartX;
			const startY = s.touchStartY;
			const touch = ev.changedTouches[0];
			s.touchStartX = Number.NaN;
			s.touchStartY = Number.NaN;
			if (!touch) return;

			const dx = touch.clientX - startX;
			const dy = touch.clientY - startY;
			const absX = Math.abs(dx);
			const absY = Math.abs(dy);
			const dominantDistance = verticalMode ? absY : absX;
			const crossDistance = verticalMode ? absX : absY;

			if (
				dominantDistance < TOUCH_PAGE_FLIP_THRESHOLD ||
				dominantDistance <= crossDistance
			) {
				return;
			}

			ev.preventDefault();
			if (verticalMode) {
				s.pageManager?.flipPage(dy < 0 ? 1 : -1);
			} else {
				s.pageManager?.flipPage(dx < 0 ? 1 : -1);
			}
		};
		scrollEl.addEventListener("touchstart", handleTouchStart, {
			passive: true,
		});
		scrollEl.addEventListener("touchend", handleTouchEnd, { passive: false });

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
				if (initialBookmark) {
					s.displayedBookmark = initialBookmark;
					updateBookmarkScreen();
				}
				reportExplored(s.previousIntendedCount);
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
			navigateToTextAnchor,
			resolveTextAnchor,
			// Paginated mode never shows a document scrollbar (body is
			// overflow-hidden), so there is nothing to hide.
			getBookmark: () => {
				const exploredCharCount = Math.max(0, s.previousIntendedCount);
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
				s.displayedBookmark = bookmark;
				// Count 0 = the book start: first section, first page.
				const index = target
					? calculator.getSectionIndexByCharCount(target)
					: 0;
				const scroll = () => {
					const pos = target ? calculator.getScrollPosByCharCount(target) : 0;
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
			relayout: scheduleRelayout,
		});

		return () => {
			cancelled = true;
			s.renderGeneration += 1;
			clearTimeout(s.recalcTimer);
			clearTimeout(s.resizeTimer);
			clearTimeout(s.relayoutTimer);
			clearPreparedSections();
			contentEl.removeEventListener("click", handleContentClick);
			contentEl.removeEventListener("load", handleResourceLoad, true);
			scrollEl.removeEventListener("touchstart", handleTouchStart);
			scrollEl.removeEventListener("touchend", handleTouchEnd);
			contentEl.innerHTML = "";
			document.body.removeEventListener("wheel", handleWheel);
			cleanupChrome();
			apiRef(null);
		};
	});

	useWindowEvent("resize", () => {
		const s = internalsRef.current;
		// Resize fires after column geometry has started changing. Preserve the
		// last user-intended character rather than sampling a transient page.
		clearTimeout(s.resizeTimer);
		s.resizeTimer = setTimeout(() => {
			setResizeTick((tick) => tick + 1);
			scheduleRelayout();
		}, 100);
	});

	const { width, height } = viewport;
	const columnCount = verticalMode ? 1 : pageColumns || Math.ceil(width / 1000);
	const pageHeight = verticalMode
		? readerColumnHeightCss(
				viewportHeight(),
				secondDimensionMaxValue,
				reservePlayerSpace,
			)
		: getPaginatedPageHeight(height, reservePlayerSpace);

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
		maxHeight: verticalMode && height ? pageHeight : undefined,
		...({
			"--book-content-child-width": `${width}px`,
			"--book-content-child-height": pageHeight,
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
					lang={language || undefined}
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
					<BookmarkSimple weight="fill" className="size-5" />
				</div>
			)}

			{!allowDisplay && <ReaderLoadingOverlay theme={theme} />}
		</>
	);
}
