import { type CSSProperties, useMemo, useRef, useState } from "react";
import type { LazyHtmlBook } from "@/features/reader/document/lazy-html-book";
import { mergeImageOnlySectionRuns } from "@/features/reader/document/merge-image-sections";
import { refitImageWidths } from "@/features/reader/document/processing/image-dimensions";
import {
	type ReaderPosition,
	type ReaderTextAnchor,
	SECTION_REFERENCE_PREFIX,
} from "@/features/reader/document/types";
import type { BaseReaderProps } from "@/features/reader/reader-contract";
import { PageManagerPaginated } from "@/features/reader/renderers/paginated/page-manager-paginated";
import { SectionCharacterStatsCalculator } from "@/features/reader/renderers/paginated/section-stats-calculator";
import { resolveReaderTextAnchorOffset } from "@/features/reader/renderers/paginated/text-anchor";
import { handleReaderContentClick } from "@/features/reader/renderers/shared/reader-content-click";
import { applyReaderDocumentChrome } from "@/features/reader/renderers/shared/reader-document-chrome";
import {
	buildReaderClasses,
	buildReaderStyle,
} from "@/features/reader/renderers/shared/reader-style";
import {
	readerColumnHeightCss,
	viewportHeight,
	viewportWidth,
} from "@/features/reader/renderers/shared/viewport";
import {
	createReaderLayoutScheduler,
	type ReaderLayoutScheduler,
	useReaderSurfaceResize,
} from "@/features/reader/session/reader-layout";
import { createReaderPositionCore } from "@/features/reader/session/reader-position";
import { ReaderLoadingOverlay } from "@/features/reader/ui/chrome/reader-loading-overlay";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";

const PAGE_GAP = 40;
const TOUCH_PAGE_FLIP_THRESHOLD = 40;

interface BookReaderPaginatedProps extends BaseReaderProps {
	avoidPageBreak: boolean;
	pageColumns: number;
	reservePlayerSpace: boolean;
	lazyBook?: LazyHtmlBook;
}

interface PaginatedInternals {
	sectionEls: Element[];
	calculator?: SectionCharacterStatsCalculator;
	pageManager?: PageManagerPaginated;
	sectionIndex: number;
	virtualScrollPos: number;
	previousIntendedCount: number;
	recalcTimer?: ReturnType<typeof setTimeout>;
	resizeTimer?: ReturnType<typeof setTimeout>;
	layoutScheduler?: ReaderLayoutScheduler;
	lastWheelAt: number;
	/** Swipe origin for touch page-flips (mobile has no wheel/keyboard). */
	touchStartX: number;
	touchStartY: number;
	/** Small detached cache for the previous and next pre-parsed sections. */
	preparedSections: Map<number, Promise<PreparedSection>>;
	activeObjectUrls: string[];
	cancelStaging?: () => void;
	/** Invalidates async renders and late resource callbacks from older sections. */
	renderGeneration: number;
}

interface PreparedSection {
	container: HTMLElement;
	resourcesReady: Promise<void>;
	objectUrls: string[];
}

function revokeObjectUrls(urls: readonly string[]) {
	for (const url of urls) URL.revokeObjectURL(url);
}

function disposePreparedSection(prepared: PreparedSection) {
	prepared.container.replaceChildren();
	revokeObjectUrls(prepared.objectUrls);
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
	lazyBook,
	sections,
	initialPosition,
	onPositionChange,
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
		activeObjectUrls: [],
		renderGeneration: 0,
	});
	const [allowDisplay, setAllowDisplay] = useState(false);
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
	const positionCore = createReaderPositionCore({
		sections,
		getCharacterCount: () => internalsRef.current.calculator?.charCount ?? 0,
	});

	const onPositionChangeRef = useRef(onPositionChange);
	onPositionChangeRef.current = onPositionChange;
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

	const positionForExplored = (exploredCharCount: number): ReaderPosition => {
		return positionCore.positionFor(exploredCharCount);
	};

	const reportExplored = (intendedCount?: number) => {
		const s = internalsRef.current;
		if (!s.calculator) return;
		const explored =
			intendedCount ?? s.calculator.calcPreciseExploredCharCount();
		onPositionChangeRef.current(positionForExplored(Math.max(0, explored)));
	};

	const clearPreparedSections = () => {
		const s = internalsRef.current;
		s.cancelStaging?.();
		s.cancelStaging = undefined;
		for (const pending of s.preparedSections.values()) {
			void pending.then(disposePreparedSection);
		}
		s.preparedSections.clear();
		revokeObjectUrls(s.activeObjectUrls);
		s.activeObjectUrls = [];
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
		const contentEl = contentElRef.current;
		if (contentEl) refitImageWidths(contentEl, height);
		s.cancelStaging?.();
		s.cancelStaging = undefined;
	};

	// Re-measures the current section and re-anchors to the last user-intended
	// reading position.
	const relayoutNow = () => {
		const s = internalsRef.current;
		if (!s.calculator || !s.pageManager) return;
		refitImages();
		s.pageManager.scrollTo(0, false);
		s.calculator.updateParagraphPos();
		const exploredCharCount = Math.max(0, s.previousIntendedCount);
		const pos = s.calculator.getScrollPosByCharCount(exploredCharCount);
		if (pos >= 0) {
			s.pageManager.scrollTo(pos, false);
		}
		reportExplored(exploredCharCount);
	};

	// Debounced: the quick-settings sliders commit one layout change per drag
	// tick, and re-measuring every paragraph on each tick freezes the drag.
	// Only the last tick's layout matters; the timer also guarantees React has
	// committed the new layout props before anything is measured.
	const scheduleRelayout = (position?: ReaderPosition) => {
		const s = internalsRef.current;
		if (position) s.previousIntendedCount = position.exploredCharCount;
		s.layoutScheduler?.request();
	};

	// Pre-parse + decode images off-DOM so section crossings paint instantly.
	const prepareSection = (
		index: number,
	): Promise<PreparedSection | undefined> => {
		const s = internalsRef.current;
		const section = s.sectionEls[index];
		if (!section) return Promise.resolve(undefined);
		const existing = s.preparedSections.get(index);
		if (existing) return existing;
		const pending = (async (): Promise<PreparedSection> => {
			const container = document.createElement("div");
			let objectUrls: string[] = [];
			if (lazyBook) {
				const formatted = await lazyBook.loadSection(
					index,
					contentElRef.current?.clientHeight || viewportRef.current.height,
				);
				container.innerHTML = formatted.elementHtml;
				if (formatted.styleSheet) {
					const style = document.createElement("style");
					style.textContent = formatted.styleSheet;
					container.prepend(style);
				}
				objectUrls = formatted.objectUrls;
			} else {
				container.innerHTML = section.innerHTML;
			}
			return {
				container,
				resourcesReady: waitForSectionImageResources(container, document),
				objectUrls,
			};
		})();
		s.preparedSections.set(index, pending);
		return pending;
	};

	const scheduleAdjacentStaging = (index: number) => {
		const s = internalsRef.current;
		const targets = [index - 1, index + 1].filter((target) =>
			Boolean(s.sectionEls[target]),
		);
		s.cancelStaging?.();
		for (const [preparedIndex, pending] of s.preparedSections) {
			if (targets.includes(preparedIndex)) continue;
			s.preparedSections.delete(preparedIndex);
			void pending.then(disposePreparedSection);
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
		void prepareSection(index).then((prepared) => {
			if (!prepared) return;
			return prepared.resourcesReady.then(() => {
				if (generation !== s.renderGeneration) return;
				s.preparedSections.delete(index);
				revokeObjectUrls(s.activeObjectUrls);
				s.activeObjectUrls = prepared.objectUrls;

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
				// The caller owns the destination. Reporting here would sample the
				// freshly mounted section at page zero before a backwards/restore
				// transition places its real page, making the footer briefly jump.
				onRendered?.();
				scheduleAdjacentStaging(index);
			});
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
		const layoutScheduler = createReaderLayoutScheduler({
			run: (transaction) => {
				document.fonts.ready.then(() => {
					requestAnimationFrame(() => {
						if (cancelled || !transaction.isCurrent()) return;
						relayoutNow();
					});
				});
			},
		});
		s.layoutScheduler = layoutScheduler;

		const cleanupChrome = applyReaderDocumentChrome({
			mode: "paginated",
			verticalMode,
			backgroundColor: theme.backgroundColor,
		});

		if (lazyBook) {
			// Placeholders keep the page manager's small interface intact; their
			// real DOM is requested only when a section is rendered.
			s.sectionEls = sections.map((section) => {
				const placeholder = document.createElement("div");
				placeholder.id = section.reference;
				return placeholder;
			});
		} else {
			const tempContainer = document.createElement("div");
			tempContainer.innerHTML = htmlContent;
			// Vertical mode is always single-column, so runs stay one per page there.
			s.sectionEls = verticalMode
				? Array.from(tempContainer.children)
				: mergeImageOnlySectionRuns(
						Array.from(tempContainer.children),
						document,
					);
		}

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
			lazyBook?.sectionCharacterCounts,
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
					if (!isUser) {
						// A reflow/restore can temporarily expose a different page while
						// columns settle. It is not reader input, so never publish its
						// geometry as progress.
						reportExplored(s.previousIntendedCount);
						return;
					}
					const explored = Math.max(
						0,
						s.calculator.calcPreciseExploredCharCount(),
					);
					s.previousIntendedCount = explored;
					reportExplored(explored);
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

		// Wheel flips pages (nanahoshi: throttled, passive)
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

			// `exploredCharCount` is the canonical coordinate shared by every
			// renderer. A chapter locator remains useful for cross-document restore,
			// but its offsets are measured by a different engine and must not replace
			// that global coordinate during a layout switch.
			const charCount = Math.max(0, initialPosition?.exploredCharCount ?? 0);
			const startIndex = charCount
				? calculator.getSectionIndexByCharCount(charCount)
				: 0;

			renderSection(startIndex, () => {
				s.previousIntendedCount = charCount;
				if (charCount) {
					const pos = calculator.getScrollPosByCharCount(charCount);
					if (pos >= 0) {
						pageManager.scrollTo(pos, false);
					}
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
			getPosition: () =>
				positionForExplored(Math.max(0, s.previousIntendedCount)),
			scrollToPosition: (position) => {
				const target = Math.max(0, position.exploredCharCount);
				// Count 0 = the book start: first section, first page.
				const index = target
					? calculator.getSectionIndexByCharCount(target)
					: 0;
				const scroll = () => {
					s.previousIntendedCount = target;
					const pos = target ? calculator.getScrollPosByCharCount(target) : 0;
					if (pos >= 0) {
						pageManager.scrollTo(pos, false);
					}
				};
				if (s.sectionIndex === index) {
					scroll();
				} else {
					renderSection(index, scroll);
				}
			},
			relayout: scheduleRelayout,
		});

		return () => {
			cancelled = true;
			s.renderGeneration += 1;
			layoutScheduler.cancel();
			if (s.layoutScheduler === layoutScheduler) {
				s.layoutScheduler = undefined;
			}
			clearTimeout(s.recalcTimer);
			clearTimeout(s.resizeTimer);
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

	const scheduleSurfaceRelayout = () => {
		const s = internalsRef.current;
		// Resize fires after column geometry has started changing. Preserve the
		// last user-intended character rather than sampling a transient page.
		clearTimeout(s.resizeTimer);
		s.resizeTimer = setTimeout(() => {
			setResizeTick((tick) => tick + 1);
			scheduleRelayout();
		}, 100);
	};
	useWindowEvent("resize", scheduleSurfaceRelayout);
	useReaderSurfaceResize(() => scrollElRef.current, scheduleSurfaceRelayout);

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
					data-reader-renderer="text-paginated"
					lang={language || undefined}
					className={scrollElClasses}
					style={scrollElStyle}
				>
					<div ref={contentElRef} className="book-content-container" />
				</div>
			</div>

			{!allowDisplay && <ReaderLoadingOverlay theme={theme} />}
		</>
	);
}
