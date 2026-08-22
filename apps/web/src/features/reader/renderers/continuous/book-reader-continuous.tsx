import { type CSSProperties, type RefObject, useRef, useState } from "react";
import { refitImageWidths } from "@/features/reader/document/processing/image-dimensions";
import {
	type ReaderPosition,
	SECTION_REFERENCE_PREFIX,
	type SectionWithProgress,
} from "@/features/reader/document/types";
import {
	getReaderScrollbarColor,
	getReaderScrollbarTrackColor,
} from "@/features/reader/presentation/settings";
import type { BaseReaderProps } from "@/features/reader/reader-contract";
import { CharacterStatsCalculator } from "@/features/reader/renderers/continuous/character-stats-calculator";
import {
	AutoScrollerContinuous,
	formatPos,
	horizontalMouseWheel,
	PageManagerContinuous,
} from "@/features/reader/renderers/continuous/continuous-primitives";
import { handleReaderContentClick } from "@/features/reader/renderers/shared/reader-content-click";
import {
	applyReaderDocumentChrome,
	getReaderScrollbarWidth,
} from "@/features/reader/renderers/shared/reader-document-chrome";
import {
	buildContinuousReaderSizing,
	buildReaderClasses,
	buildReaderStyle,
} from "@/features/reader/renderers/shared/reader-style";
import { readerColumnHeightCss } from "@/features/reader/renderers/shared/viewport";
import {
	createReaderLayoutScheduler,
	type ReaderLayoutScheduler,
	useReaderSurfaceResize,
} from "@/features/reader/session/reader-layout";
import { createTextReaderSession } from "@/features/reader/session/text-reader-session";
import { ReaderLoadingOverlay } from "@/features/reader/ui/chrome/reader-loading-overlay";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";

export type { SectionWithProgress } from "@/features/reader/document/types";
export type { BookReaderApi } from "@/features/reader/reader-contract";

interface BookReaderContinuousProps extends BaseReaderProps {
	autoPositionOnResize: boolean;
	autoScrollMultiplier: number;
	reservePlayerSpace: boolean;
	scrollContainerRef: RefObject<HTMLElement | null>;
	onAutoScrollChange: (enabled: boolean) => void;
}

interface ReaderInternals {
	calculator?: CharacterStatsCalculator;
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
	sectionToElement: Map<string, HTMLElement>;
	sectionData: Map<string, SectionWithProgress>;
	recalcTimer?: ReturnType<typeof setTimeout>;
	resizeTimer?: ReturnType<typeof setTimeout>;
	sectionTimer?: ReturnType<typeof setTimeout>;
	layoutScheduler?: ReaderLayoutScheduler;
	pendingRelayoutRevision?: number;
	preciseScrollTimer?: ReturnType<typeof setTimeout>;
	layoutRevision: number;
	scheduleRecalc?: (restorePosition?: boolean) => void;
	userInputPending: boolean;
	userInputTimer?: ReturnType<typeof setTimeout>;
	/** User scroll observed but not yet converted to a semantic character. */
	uncommittedUserPosition: boolean;
	settledInnerWidth: number;
	settledInnerHeight: number;
}

export function BookReaderContinuous({
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
	autoPositionOnResize,
	autoScrollMultiplier,
	reservePlayerSpace,
	scrollContainerRef,
	sections,
	initialPosition,
	onPositionChange,
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
		layoutRevision: 0,
		userInputPending: false,
		uncommittedUserPosition: false,
		settledInnerWidth: 0,
		settledInnerHeight: 0,
		sectionToElement: new Map(),
		sectionData: new Map(),
	});
	const [allowDisplay, setAllowDisplay] = useState(false);
	const getScrollContainer = () =>
		scrollContainerRef.current ?? document.documentElement;
	const getViewportWidth = () => getScrollContainer().clientWidth;
	const getViewportHeight = () => getScrollContainer().clientHeight;
	const getColumnHeight = (maxHeight: number) => {
		const viewport = getViewportHeight();
		return verticalMode && maxHeight ? Math.min(maxHeight, viewport) : viewport;
	};
	const textSession = createTextReaderSession({
		sections,
		getCharacterCount: () => internalsRef.current.calculator?.charCount ?? 0,
	});

	const onPositionChangeRef = useRef(onPositionChange);
	onPositionChangeRef.current = onPositionChange;
	const onSectionProgressChangeRef = useRef(onSectionProgressChange);
	onSectionProgressChangeRef.current = onSectionProgressChange;
	const onAutoScrollChangeRef = useRef(onAutoScrollChange);
	onAutoScrollChangeRef.current = onAutoScrollChange;
	const disableWheelNavigationRef = useRef(disableWheelNavigation);
	disableWheelNavigationRef.current = disableWheelNavigation;
	const navigationBlockedRef = useRef(navigationBlocked);
	navigationBlockedRef.current = navigationBlocked;
	// Live settings read by long-lived DOM handlers (the component does not
	// remount when these change, so closures must not capture them).
	const livePropsRef = useRef({
		fontSize,
		firstDimensionMargin,
		secondDimensionMaxValue,
		hideFurigana,
		furiganaStyle,
		reservePlayerSpace,
	});
	livePropsRef.current = {
		fontSize,
		firstDimensionMargin,
		secondDimensionMaxValue,
		hideFurigana,
		furiganaStyle,
		reservePlayerSpace,
	};

	// Live layout props reflow the book on React commit, before the parent
	// gets to call relayout(); mark the viewport so reflow-induced scroll events
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

	const reportIntendedPosition = () => {
		const s = internalsRef.current;
		const position = readPosition(s.prevIntendedCharCount);
		if (position) onPositionChangeRef.current(position);
	};
	const markUserInputPending = () => {
		const s = internalsRef.current;
		s.userInputPending = true;
		clearTimeout(s.userInputTimer);
		// A tap/touchstart that never scrolls must not be mistaken for reading
		// input by a later viewport reflow.
		s.userInputTimer = setTimeout(() => {
			s.userInputPending = false;
		}, 500);
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
						Math.max(rect.right + margin - getViewportWidth(), 0),
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
		const height = verticalMode
			? contentEl.clientHeight ||
				getColumnHeight(livePropsRef.current.secondDimensionMaxValue)
			: getColumnHeight(livePropsRef.current.secondDimensionMaxValue);
		refitImageWidths(contentEl, height);
	};

	// Vertical mode: pin the reading strip to the measured reading area so it
	// fills the player-safe viewport — no hidden text below, no clipped top
	// line. The reader scroll container's clientHeight already excludes a
	// classic horizontal scrollbar and is reliable CSS px on HiDPI, unlike the
	// `100dvh` unit + scrollbar probe it replaces. Read after layout (finishInit
	// / resize) when the horizontal scrollbar is present; the CSS `height:100dvh`
	// rule is the pre-measure fallback while the loading overlay is up.
	const applyVerticalReadingHeight = () => {
		const contentEl = contentElRef.current;
		if (!contentEl || !verticalMode) return;
		// The rendered column height = player-safe viewport height, capped by the
		// optional max-height setting. Drive the strip and image-height cap from
		// this one measured value so tall images can never exceed the column
		// (which would overflow it and let the page scroll on Y). Stays correct
		// across the mobile dynamic viewport, unlike the value baked at render.
		const column = readerColumnHeightCss(
			getViewportHeight(),
			livePropsRef.current.secondDimensionMaxValue,
			false,
		);
		contentEl.style.height = column;
		contentEl.style.setProperty("--book-content-child-height", column);
		// Vertical mode reads along the horizontal axis; the vertical axis must
		// stay pinned at 0. `overflow-y: hidden` only hides the scrollbar — it
		// does not clear a residual vertical offset carried over from horizontal
		// mode's vertical reading scroll, which (clamped to any stray vertical
		// overflow) shifts every column up and clips the top line. Reset it
		// without touching the horizontal reading scroll.
		const scrollEl = getScrollContainer();
		if (scrollEl.scrollTop !== 0) {
			scrollEl.scrollTo({ top: 0, left: scrollEl.scrollLeft });
		}
	};

	const navigateToSection = (reference: string) => {
		const s = internalsRef.current;
		let targetElement = document.getElementById(reference);
		if (!targetElement) return;

		if (!reference.startsWith(SECTION_REFERENCE_PREFIX)) {
			targetElement =
				targetElement.closest(`div[id^="${SECTION_REFERENCE_PREFIX}"]`) ||
				targetElement;
		}

		const rect = targetElement.getBoundingClientRect();
		const margin = livePropsRef.current.firstDimensionMargin || 0;
		const scrollEl = getScrollContainer();

		if (verticalMode) {
			scrollEl.scrollBy(
				-(getViewportWidth() - rect.right - margin - s.scrollAdjustment),
				0,
			);
		} else {
			scrollEl.scrollBy(0, rect.top - margin - s.scrollAdjustment);
		}
	};

	const readPosition = (charCount: number): ReaderPosition | undefined => {
		const s = internalsRef.current;
		if (!s.calculator) return undefined;
		const offset = verticalMode
			? getScrollContainer().scrollLeft
			: getScrollContainer().scrollTop;
		return textSession.positionFor(charCount, {
			[verticalMode ? "scrollX" : "scrollY"]: offset,
		});
	};

	const exactScrollFor = (position: ReaderPosition) => {
		const s = internalsRef.current;
		const offset = verticalMode ? position.scrollX : position.scrollY;
		if (!offset || !s.calculator) return undefined;
		const formatted = formatPos(offset, s.calculator.direction);
		if (
			s.calculator.getCharCountByScrollPos(formatted) !==
			position.exploredCharCount
		) {
			return undefined;
		}
		return verticalMode ? { left: offset } : { top: offset };
	};

	const scrollToReadingPos = (position: ReaderPosition) => {
		const s = internalsRef.current;
		if (!s.calculator || !s.pageManager) return;
		// With the same rendered document, the recorded pixel coordinate is the
		// only lossless position inside an image. Prefer it when it still maps to
		// the saved character. The chapter locator is a cross-layout fallback,
		// not a replacement for a valid exact coordinate.
		const exact = exactScrollFor(position);
		const restorePlan = textSession.planRestore(position, Boolean(exact));
		if (restorePlan.useExactCoordinate && exact) {
			s.prevIntendedCharCount = restorePlan.exploredCharCount;
			s.isProgrammaticScroll = true;
			getScrollContainer().scrollTo(exact);
			return;
		}
		const exploredCharCount = restorePlan.exploredCharCount;

		// Make this the position the reflow corrector holds, or the next
		// image-load/resize/relayout would yank us back to where we were before
		// the jump.
		s.prevIntendedCharCount = exploredCharCount;

		// Count 0 = the very start of the book; no paragraph to anchor.
		if (!exploredCharCount) {
			s.isProgrammaticScroll = true;
			s.pageManager.scrollTo(0);
			return;
		}

		// Otherwise the stored offset is meaningless: anchor the paragraph at the
		// reading edge by char count.
		s.isProgrammaticScroll = true;
		s.pageManager.scrollTo(
			s.calculator.getReadingEdgeScrollPos(exploredCharCount),
		);
	};

	useMountEffect(() => {
		const contentEl = contentElRef.current;
		if (!contentEl) return;
		const scrollEl = getScrollContainer();

		// Set the book HTML imperatively, outside React reconciliation: with
		// dangerouslySetInnerHTML React 19 re-sets innerHTML when the {__html}
		// wrapper identity changes, which detaches the nodes the calculator
		// measures and forces every image to reload on each re-render.
		contentEl.innerHTML = htmlContent;

		const s = internalsRef.current;
		s.settledInnerWidth = scrollEl.clientWidth;
		s.settledInnerHeight = scrollEl.clientHeight;
		let cancelled = false;
		const layoutScheduler = createReaderLayoutScheduler({
			run: (transaction) => {
				const revision = s.pendingRelayoutRevision;
				document.fonts.ready.then(() => {
					requestAnimationFrame(async () => {
						if (
							cancelled ||
							!transaction.isCurrent() ||
							revision === undefined ||
							revision !== s.layoutRevision
						) {
							return;
						}
						const margin = livePropsRef.current.firstDimensionMargin || 0;
						s.pageManager = new PageManagerContinuous(
							verticalMode,
							margin,
							scrollEl,
						);
						refitImages();
						s.isProgrammaticScroll = true;
						s.pageManager.scrollTo(
							calculator.getReadingEdgeScrollPos(s.prevIntendedCharCount),
						);
						const measured = await calculator.updateParagraphPosCooperative(
							0,
							() =>
								cancelled ||
								!transaction.isCurrent() ||
								revision !== s.layoutRevision,
						);
						if (
							!measured ||
							cancelled ||
							!transaction.isCurrent() ||
							revision !== s.layoutRevision
						) {
							return;
						}
						restoreIntendedPos();
						reportIntendedPosition();
						updateSectionProgress();
						clearLayoutDirtyNextFrame();
					});
				});
			},
		});
		s.layoutScheduler = layoutScheduler;

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
			scrollEl,
			document,
		);
		const pageManager = new PageManagerContinuous(
			verticalMode,
			firstDimensionMargin || 0,
			scrollEl,
		);
		const autoScroller = new AutoScrollerContinuous(
			autoScrollMultiplier,
			verticalMode,
			scrollEl,
		);
		autoScroller.setToggleListener((enabled) =>
			onAutoScrollChangeRef.current(enabled),
		);

		s.calculator = calculator;
		s.pageManager = pageManager;
		s.autoScroller = autoScroller;

		const handleContentClick = (event: MouseEvent) =>
			handleReaderContentClick(event, livePropsRef.current, navigateToSection);
		contentEl.addEventListener("click", handleContentClick);

		// Layout shifts from late image loads: recalculate paragraph positions
		// and keep the intended reading position stable.
		const scheduleRecalc = (restorePosition = true) => {
			clearTimeout(s.recalcTimer);
			const revision = ++s.layoutRevision;
			s.recalcTimer = setTimeout(async () => {
				if (cancelled) return;
				const measured = await calculator.updateParagraphPosCooperative(
					0,
					() => cancelled || revision !== s.layoutRevision,
				);
				if (!measured) return;
				if (restorePosition) {
					restoreIntendedPos();
				} else {
					s.prevIntendedCharCount = calculator.calcPreciseExploredCharCount();
				}
				s.uncommittedUserPosition = false;
				reportIntendedPosition();
				updateSectionProgress();
				clearLayoutDirtyNextFrame();
			}, 150);
		};
		const handleResourceLoad = () => {
			s.layoutDirty = true;
			scheduleRecalc(!s.uncommittedUserPosition);
		};
		s.scheduleRecalc = scheduleRecalc;
		contentEl.addEventListener("load", handleResourceLoad, true);

		// Vertical mode: translate vertical wheel into horizontal page scroll
		const scrollFn = horizontalMouseWheel(4, scrollEl, requestAnimationFrame);
		const handleWheel = (ev: WheelEvent) => {
			if (navigationBlockedRef.current) return;
			markUserInputPending();
			if (
				verticalMode &&
				!disableWheelNavigationRef.current &&
				contentEl.contains(ev.target as Node)
			) {
				scrollFn(ev, livePropsRef.current.fontSize, getViewportWidth());
			}
		};
		document.body.addEventListener("wheel", handleWheel, { passive: false });

		const finishInit = async () => {
			if (cancelled) return;
			applyVerticalReadingHeight();
			refitImages();
			const measured = await calculator.updateParagraphPosCooperative(
				0,
				() => cancelled,
			);
			if (!measured) return;

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
				scrollToReadingPos(initialPosition);
			}
			reportIntendedPosition();
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
			// prevIntendedCharCount is the canonical semantic anchor. Re-sampling a
			// line after reflow would return that line's new first character and
			// slowly move the saved position on every viewport or font change.
			getPosition: () => readPosition(s.prevIntendedCharCount),
			scrollToPosition: (position) => scrollToReadingPos(position),
			setScrollbarHidden: (hidden) => {
				// The gutter change reflows the book and fires scroll events; flag
				// them as layout-induced so they don't overwrite the intended
				// position (the recalc on un-hide clears the flag).
				s.layoutDirty = true;
				scrollEl.style.setProperty(
					"scrollbar-width",
					hidden ? "none" : getReaderScrollbarWidth(),
				);
				if (!hidden) scheduleRecalc();
			},
			relayout: (position) => {
				s.layoutDirty = true;
				// Debounced: the quick-settings sliders commit one change per drag
				// tick and re-measuring the whole book each tick freezes the drag.
				// Then wait for any new font to be ready and re-measure with the
				// margin/page-size dependent managers rebuilt from live props.
				if (position) {
					s.prevIntendedCharCount = position.exploredCharCount;
				}
				s.pendingRelayoutRevision = ++s.layoutRevision;
				layoutScheduler.request();
			},
		});

		return () => {
			cancelled = true;
			layoutScheduler.cancel();
			if (s.layoutScheduler === layoutScheduler) {
				s.layoutScheduler = undefined;
			}
			clearTimeout(s.recalcTimer);
			clearTimeout(s.resizeTimer);
			clearTimeout(s.sectionTimer);
			clearTimeout(s.preciseScrollTimer);
			clearTimeout(s.userInputTimer);
			s.scheduleRecalc = undefined;
			autoScroller.destroy();
			contentEl.removeEventListener("click", handleContentClick);
			contentEl.removeEventListener("load", handleResourceLoad, true);
			contentEl.innerHTML = "";
			document.body.removeEventListener("wheel", handleWheel);
			cleanupChrome();
			apiRef(null);
		};
	});

	useWindowEvent("touchstart", (event) => {
		if (
			!navigationBlockedRef.current &&
			contentElRef.current?.contains(event.target as Node)
		) {
			markUserInputPending();
		}
	});

	useWindowEvent("pointerdown", (event) => {
		const target = event.target;
		if (
			!navigationBlockedRef.current &&
			(target === getScrollContainer() ||
				target === document.body ||
				target === document.documentElement)
		) {
			// Native scrollbar drags and middle-click autoscroll target the scroll
			// container rather than the publication, but still represent navigation.
			markUserInputPending();
		}
	});

	useWindowEvent("keydown", (event) => {
		if (
			!navigationBlockedRef.current &&
			[
				"ArrowDown",
				"ArrowLeft",
				"ArrowRight",
				"ArrowUp",
				"End",
				"Home",
				"PageDown",
				"PageUp",
				"Space",
			].includes(event.code)
		) {
			markUserInputPending();
		}
	});

	const handleScroll = () => {
		const s = internalsRef.current;
		const scrollEl = getScrollContainer();
		// Chromium may dispatch the scroll caused by viewport reflow before the
		// window resize event. Detect the dimension change here as well, otherwise
		// that first scroll frame can replace the semantic anchor with transient
		// geometry before the resize handler marks it dirty.
		const viewportChanged =
			scrollEl.clientWidth !== s.settledInnerWidth ||
			scrollEl.clientHeight !== s.settledInnerHeight;
		if (viewportChanged) {
			s.layoutDirty = true;
		}
		const programmaticWithoutUserInput =
			s.isProgrammaticScroll && !s.userInputPending;
		const userInputAtEvent = s.userInputPending;
		if (
			userInputAtEvent ||
			(!s.isProgrammaticScroll && !s.layoutDirty && !viewportChanged)
		) {
			s.uncommittedUserPosition = true;
		}
		const ignorePositionUpdate =
			s.layoutDirty || viewportChanged || programmaticWithoutUserInput;
		if (s.layoutDirty && s.userInputPending) {
			s.layoutRevision += 1;
			// Respect input made during a pending reflow: cancel the stale restore,
			// then re-measure and adopt the user's new position once layout settles.
			s.scheduleRecalc?.(false);
		}
		s.isProgrammaticScroll = false;
		clearTimeout(s.userInputTimer);
		s.userInputPending = false;
		clearTimeout(s.sectionTimer);
		s.sectionTimer = setTimeout(updateSectionProgress, 500);
		clearTimeout(s.preciseScrollTimer);
		if (!ignorePositionUpdate) {
			s.preciseScrollTimer = setTimeout(() => {
				if (!s.calculator || s.isProgrammaticScroll || s.layoutDirty) return;
				const precise = s.calculator.calcPreciseExploredCharCount();
				s.prevIntendedCharCount = precise;
				s.uncommittedUserPosition = false;
				const position = readPosition(precise);
				if (position) onPositionChangeRef.current(position);
			}, 120);
		}
	};

	useMountEffect(() => {
		const scrollEl = getScrollContainer();
		scrollEl.addEventListener("scroll", handleScroll, { passive: true });
		return () => scrollEl.removeEventListener("scroll", handleScroll);
	});

	const scheduleSurfaceRelayout = () => {
		const s = internalsRef.current;
		const scrollEl = getScrollContainer();
		clearTimeout(s.preciseScrollTimer);
		// The resize event fires after the browser has started reflowing, so live
		// geometry is already unsafe to sample here. Preserve the last settled
		// character anchor and ignore reflow-induced scroll events until the new
		// measurement restores it.
		s.layoutDirty = true;
		s.settledInnerWidth = scrollEl.clientWidth;
		s.settledInnerHeight = scrollEl.clientHeight;
		clearTimeout(s.resizeTimer);
		s.resizeTimer = setTimeout(() => {
			requestAnimationFrame(() => {
				if (!s.calculator || !s.pageManager) return;
				applyVerticalReadingHeight();
				refitImages();
				s.scheduleRecalc?.(autoPositionOnResize && !s.uncommittedUserPosition);
			});
		}, 100);
	};
	useWindowEvent("resize", scheduleSurfaceRelayout);
	useReaderSurfaceResize(getScrollContainer, scheduleSurfaceRelayout);

	// Height helpers read window/document, so guard them for SSR (the strip is
	// re-pinned client-side in applyVerticalReadingHeight anyway).
	const childHeight =
		typeof window === "undefined"
			? "0px"
			: verticalMode
				? readerColumnHeightCss(
						getViewportHeight(),
						secondDimensionMaxValue,
						false,
					)
				: `${getColumnHeight(secondDimensionMaxValue)}px`;

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
		...buildContinuousReaderSizing(verticalMode, secondDimensionMaxValue),
		...({
			// The image-height cap must equal the *rendered* column height (the
			// smaller of the configured max-height and the viewport), not the
			// configured max alone — on a viewport shorter than the max (mobile,
			// split view) a taller cap lets images overflow the column and the
			// page scroll on touch. applyVerticalReadingHeight keeps this in sync
			// on resize; readerColumnHeight is the single source for the value.
			"--book-content-child-height": childHeight,
		} as CSSProperties),
	};

	const containerClasses = buildReaderClasses({
		mode: "continuous",
		verticalMode,
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

	return (
		<>
			<div
				ref={contentElRef}
				data-reader-renderer="text-scroll"
				lang={language || undefined}
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

			{!allowDisplay && <ReaderLoadingOverlay theme={theme} />}
		</>
	);
}
