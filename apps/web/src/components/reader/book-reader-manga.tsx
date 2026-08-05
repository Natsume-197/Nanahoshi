import { BookmarkSimple } from "@phosphor-icons/react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useWindowEvent } from "@/hooks/use-window-event";
import {
	fitMangaPage,
	type MangaPageGeometry,
	readMangaPageGeometry,
} from "@/lib/reader/manga-page-geometry";
import {
	buildMangaSpreads,
	resolveMangaReadingDirection,
} from "@/lib/reader/manga-pagination";
import type {
	ComicLayout,
	MangaReadingDirection,
} from "@/lib/reader/manga-settings";
import type { ReaderTheme } from "@/lib/reader/settings";
import type {
	ReaderBookmark,
	Section,
	SectionWithProgress,
} from "@/lib/reader/types";
import { viewportHeight, viewportWidth } from "@/lib/reader/viewport";
import type { BookReaderApi } from "./reader-shared-props";

interface BookReaderMangaProps {
	htmlContent: string;
	theme: ReaderTheme;
	layout: ComicLayout;
	language: string;
	pageProgressionDirection?: string | null;
	readingDirection: MangaReadingDirection;
	sections: Section[];
	initialPosition: ReaderBookmark | undefined;
	initialBookmark: ReaderBookmark | undefined;
	onExploredCharCountChange: (count: number) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	onToggleChrome: () => void;
	apiRef: (api: BookReaderApi | null) => void;
}

interface MangaPage {
	reference: string;
	html: string;
	landscape: boolean;
	aspectRatio: string | undefined;
	geometry: MangaPageGeometry | undefined;
	imageSources: string[];
}

interface PointerGesture {
	id: number;
	startX: number;
	startY: number;
	lastX: number;
	lastAt: number;
	startedAt: number;
	tracking: boolean;
}

const SWIPE_INTENT_PX = 10;
const SWIPE_VELOCITY_PX_S = 450;

function readPages(htmlContent: string, strip: boolean): MangaPage[] {
	const container = document.createElement("div");
	container.innerHTML = htmlContent;
	return Array.from(container.children).map((element, index) => {
		const htmlImages = Array.from(element.querySelectorAll("img"));
		for (const htmlImage of htmlImages) {
			htmlImage.setAttribute("loading", strip ? "lazy" : "eager");
			htmlImage.setAttribute("decoding", "async");
			if (strip) htmlImage.removeAttribute("fetchpriority");
			else htmlImage.setAttribute("fetchpriority", "high");
		}
		const geometry = readMangaPageGeometry(element);
		return {
			reference: element.id || `manga-page-${index + 1}`,
			html: element.outerHTML,
			landscape: geometry !== undefined && geometry.width > geometry.height,
			aspectRatio: geometry
				? `${geometry.width} / ${geometry.height}`
				: undefined,
			geometry,
			imageSources: [
				...htmlImages.map((candidate) => candidate.getAttribute("src") ?? ""),
				...Array.from(element.querySelectorAll("svg image")).map(
					(candidate) =>
						candidate.getAttribute("href") ??
						candidate.getAttribute("xlink:href") ??
						"",
				),
			].filter(Boolean),
		};
	});
}

function sectionIndexForCount(sections: Section[], count: number): number {
	let selected = 0;
	for (let index = 0; index < sections.length; index += 1) {
		const start = sections[index]?.startCharacter ?? index;
		if (start > count) break;
		selected = index;
	}
	return selected;
}

function exploredCountForPage(sections: Section[], index: number): number {
	return sections[index]?.startCharacter ?? index;
}

function rubberband(distance: number, dimension: number, constant = 0.55) {
	return (
		(distance * dimension * constant) /
		(dimension + constant * Math.abs(distance))
	);
}

export function BookReaderManga({
	htmlContent,
	theme,
	layout,
	language,
	pageProgressionDirection,
	readingDirection,
	sections,
	initialPosition,
	initialBookmark,
	onExploredCharCountChange,
	onSectionProgressChange,
	onToggleChrome,
	apiRef,
}: BookReaderMangaProps) {
	const verticalStrip = layout === "vertical-strip";
	const horizontalStrip = layout === "horizontal-strip";
	const strip = verticalStrip || horizontalStrip;
	const pages = useMemo(
		() => readPages(htmlContent, strip),
		[htmlContent, strip],
	);
	const [viewport, setViewport] = useState(() => ({
		width: viewportWidth(),
		height: viewportHeight(),
	}));
	const [anchorPage, setAnchorPage] = useState(() =>
		Math.min(
			Math.max(
				sectionIndexForCount(sections, initialPosition?.exploredCharCount ?? 0),
				0,
			),
			Math.max(0, pages.length - 1),
		),
	);
	const [displayedBookmark, setDisplayedBookmark] = useState(initialBookmark);
	const readerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const pageSlotsRef = useRef(new Map<number, HTMLDivElement>());
	const scrollFrameRef = useRef<number | null>(null);
	const gestureRef = useRef<PointerGesture | null>(null);
	const preloadedImagesRef = useRef(new Map<string, HTMLImageElement>());
	const suppressClickRef = useRef(false);
	const anchorRef = useRef(anchorPage);
	const onExploredCharCountChangeRef = useRef(onExploredCharCountChange);
	const onSectionProgressChangeRef = useRef(onSectionProgressChange);
	anchorRef.current = anchorPage;
	onExploredCharCountChangeRef.current = onExploredCharCountChange;
	onSectionProgressChangeRef.current = onSectionProgressChange;

	const direction = resolveMangaReadingDirection(
		readingDirection,
		language,
		pageProgressionDirection,
	);
	const twoPageSpread = layout === "two-page-spread";
	const landscapePages = useMemo(
		() =>
			new Set(pages.flatMap((page, index) => (page.landscape ? [index] : []))),
		[pages],
	);
	const spreads = useMemo(
		() => buildMangaSpreads(pages.length, twoPageSpread, landscapePages),
		[pages.length, twoPageSpread, landscapePages],
	);
	const spreadIndex = Math.max(
		0,
		spreads.findIndex((spread) => spread.includes(anchorPage)),
	);
	const visiblePages = spreads[spreadIndex] ?? spreads[0] ?? [];
	const renderedPages = strip ? pages.map((_, index) => index) : visiblePages;

	const scrollToStripPage = useCallback(
		(index: number, behavior: ScrollBehavior = "smooth") => {
			const targetIndex = Math.min(Math.max(index, 0), pages.length - 1);
			setAnchorPage(targetIndex);
			pageSlotsRef.current.get(targetIndex)?.scrollIntoView?.({
				block: verticalStrip ? "start" : "nearest",
				inline: horizontalStrip ? "start" : "nearest",
				behavior,
			});
		},
		[verticalStrip, pages.length, horizontalStrip],
	);

	const moveToSpread = useCallback(
		(index: number) => {
			const target = spreads[Math.min(Math.max(index, 0), spreads.length - 1)];
			if (target) setAnchorPage(target[0]);
		},
		[spreads],
	);
	const nextPage = useCallback(
		() =>
			strip
				? scrollToStripPage(anchorRef.current + 1)
				: moveToSpread(spreadIndex + 1),
		[moveToSpread, scrollToStripPage, spreadIndex, strip],
	);
	const previousPage = useCallback(
		() =>
			strip
				? scrollToStripPage(anchorRef.current - 1)
				: moveToSpread(spreadIndex - 1),
		[moveToSpread, scrollToStripPage, spreadIndex, strip],
	);

	useWindowEvent("resize", () => {
		setViewport({ width: viewportWidth(), height: viewportHeight() });
	});

	useEffect(() => {
		if (strip) return;
		if (!visiblePages.includes(anchorPage) && visiblePages[0] !== undefined) {
			setAnchorPage(visiblePages[0]);
		}
	}, [anchorPage, strip, visiblePages]);

	useEffect(() => {
		if (!strip) return;
		const frame = requestAnimationFrame(() => {
			scrollToStripPage(anchorRef.current, "auto");
		});
		return () => cancelAnimationFrame(frame);
	}, [scrollToStripPage, strip]);

	useEffect(() => {
		const explored = exploredCountForPage(sections, anchorPage);
		onExploredCharCountChangeRef.current(explored);
		const progress = new Map<string, SectionWithProgress>();
		sections.forEach((section, index) => {
			progress.set(section.reference, {
				...section,
				progress: index < anchorPage ? 100 : 0,
			});
		});
		onSectionProgressChangeRef.current(progress);
	}, [anchorPage, sections]);

	// Keep one forward spread decoded. Retaining more would be expensive for
	// 7-megapixel manga pages; the browser already keeps the visible/back spread.
	useEffect(() => {
		if (strip) {
			preloadedImagesRef.current.clear();
			return;
		}
		const desiredSources = new Set<string>();
		for (
			let index = spreadIndex + 1;
			index < spreads.length && desiredSources.size < 2;
			index += 1
		) {
			for (const pageIndex of spreads[index] ?? []) {
				for (const source of pages[pageIndex]?.imageSources ?? []) {
					desiredSources.add(source);
					if (desiredSources.size >= 2) break;
				}
				if (desiredSources.size >= 2) break;
			}
		}
		const cache = preloadedImagesRef.current;
		for (const source of cache.keys()) {
			if (!desiredSources.has(source)) cache.delete(source);
		}
		for (const source of desiredSources) {
			if (cache.has(source)) continue;
			const image = new window.Image();
			image.decoding = "async";
			image.src = source;
			cache.set(source, image);
			void image.decode?.().catch(() => {});
		}
	}, [pages, spreadIndex, spreads, strip]);

	useEffect(() => {
		const api: BookReaderApi = {
			nextPage,
			prevPage: previousPage,
			navigateToSection(reference) {
				const index = pages.findIndex((page) => page.reference === reference);
				if (index < 0) return;
				if (strip) scrollToStripPage(index);
				else setAnchorPage(index);
			},
			getBookmark() {
				const exploredCharCount = exploredCountForPage(
					sections,
					anchorRef.current,
				);
				const total = Math.max(sections.length, 1);
				return {
					exploredCharCount,
					progress: exploredCharCount / total,
					lastBookmarkModified: Date.now(),
				};
			},
			scrollToBookmark(bookmark) {
				const index = sectionIndexForCount(
					sections,
					bookmark.exploredCharCount,
				);
				if (strip) scrollToStripPage(index);
				else setAnchorPage(index);
			},
			showBookmarkMarker: setDisplayedBookmark,
			relayout() {
				setViewport({ width: viewportWidth(), height: viewportHeight() });
			},
		};
		apiRef(api);
		return () => apiRef(null);
	}, [
		apiRef,
		strip,
		nextPage,
		pages,
		previousPage,
		scrollToStripPage,
		sections,
	]);

	const updateStripAnchor = useCallback(() => {
		const reader = readerRef.current;
		if (!reader || !strip || pages.length === 0) return;
		if (verticalStrip) {
			const targetOffset = reader.scrollTop + reader.clientHeight * 0.35;
			let low = 0;
			let high = pages.length - 1;
			let selected = 0;
			while (low <= high) {
				const middle = Math.floor((low + high) / 2);
				const slot = pageSlotsRef.current.get(middle);
				if (!slot || slot.offsetTop > targetOffset) {
					high = middle - 1;
				} else {
					selected = middle;
					low = middle + 1;
				}
			}
			if (selected !== anchorRef.current) setAnchorPage(selected);
			return;
		}
		const readerRect = reader.getBoundingClientRect();
		const probe =
			readerRect.left +
			reader.clientWidth * (direction === "rtl" ? 0.65 : 0.35);
		let selected = anchorRef.current;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (const [index, slot] of pageSlotsRef.current) {
			const rect = slot.getBoundingClientRect();
			const start = rect.left;
			const end = rect.right;
			const distance =
				probe < start ? start - probe : probe > end ? probe - end : 0;
			if (distance < closestDistance) {
				selected = index;
				closestDistance = distance;
				if (distance === 0) break;
			}
		}
		if (selected !== anchorRef.current) setAnchorPage(selected);
	}, [direction, verticalStrip, pages.length, strip]);

	const onContinuousScroll = useCallback(() => {
		if (scrollFrameRef.current !== null) return;
		scrollFrameRef.current = requestAnimationFrame(() => {
			scrollFrameRef.current = null;
			updateStripAnchor();
		});
	}, [updateStripAnchor]);

	useEffect(
		() => () => {
			if (scrollFrameRef.current !== null) {
				cancelAnimationFrame(scrollFrameRef.current);
			}
		},
		[],
	);

	const settleCanvas = () => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		canvas.style.transition = reducedMotion
			? "none"
			: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
		canvas.style.transform = "translate3d(0, 0, 0)";
		window.setTimeout(() => {
			if (canvasRef.current === canvas)
				canvas.style.removeProperty("transition");
		}, 200);
	};

	const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (strip) return;
		if (!event.isPrimary || event.button !== 0) return;
		canvasRef.current?.getAnimations().forEach((animation) => {
			animation.cancel();
		});
		event.currentTarget.setPointerCapture(event.pointerId);
		gestureRef.current = {
			id: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastAt: event.timeStamp,
			startedAt: event.timeStamp,
			tracking: false,
		};
	};

	const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (strip) return;
		const gesture = gestureRef.current;
		if (!gesture || gesture.id !== event.pointerId) return;
		const dx = event.clientX - gesture.startX;
		const dy = event.clientY - gesture.startY;
		if (!gesture.tracking) {
			if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_INTENT_PX) return;
			if (Math.abs(dy) >= Math.abs(dx)) {
				gestureRef.current = null;
				return;
			}
			gesture.tracking = true;
			suppressClickRef.current = true;
		}
		event.preventDefault();
		gesture.lastX = event.clientX;
		gesture.lastAt = event.timeStamp;

		const advanceSign = direction === "rtl" ? 1 : -1;
		const wantsNext = Math.sign(dx) === advanceSign;
		const atBoundary = wantsNext
			? spreadIndex >= spreads.length - 1
			: spreadIndex <= 0;
		const offset = atBoundary
			? rubberband(dx, Math.max(viewport.width, 1))
			: dx;
		if (canvasRef.current) {
			canvasRef.current.style.transition = "none";
			canvasRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
		}
	};

	const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
		if (strip) return;
		const gesture = gestureRef.current;
		if (!gesture || gesture.id !== event.pointerId) return;
		gestureRef.current = null;
		if (!gesture.tracking) return;

		const dx = event.clientX - gesture.startX;
		const elapsed = Math.max(event.timeStamp - gesture.startedAt, 1);
		const velocity = (dx / elapsed) * 1000;
		const threshold = Math.min(80, Math.max(48, viewport.width * 0.12));
		if (
			Math.abs(dx) >= threshold ||
			Math.abs(velocity) >= SWIPE_VELOCITY_PX_S
		) {
			const advanceSign = direction === "rtl" ? 1 : -1;
			if (Math.sign(dx) === advanceSign) nextPage();
			else previousPage();
		}
		settleCanvas();
		window.setTimeout(() => {
			suppressClickRef.current = false;
		}, 0);
	};

	const cancelPointer = () => {
		gestureRef.current = null;
		settleCanvas();
		window.setTimeout(() => {
			suppressClickRef.current = false;
		}, 0);
	};

	const onReaderClick = useCallback(
		(event: MouseEvent) => {
			if (suppressClickRef.current) return;
			const target = event.target as Element | null;
			if (target?.closest("a, button, input, select, textarea")) return;
			const rect = readerRef.current?.getBoundingClientRect();
			if (!rect) return;
			if (rect.width <= 0) return;
			const position = (event.clientX - rect.left) / rect.width;
			if (position < 0.3) {
				if (direction === "rtl") nextPage();
				else previousPage();
				return;
			}
			if (position > 0.7) {
				if (direction === "rtl") previousPage();
				else nextPage();
				return;
			}
			onToggleChrome();
		},
		[direction, nextPage, onToggleChrome, previousPage],
	);

	useEffect(() => {
		const reader = readerRef.current;
		if (!reader) return;
		reader.addEventListener("click", onReaderClick);
		return () => reader.removeEventListener("click", onReaderClick);
	}, [onReaderClick]);

	const bookmarkedPage = displayedBookmark
		? sectionIndexForCount(sections, displayedBookmark.exploredCharCount)
		: -1;
	const canvasStyle = {
		backgroundColor: theme.backgroundColor,
		flexDirection: verticalStrip
			? "column"
			: direction === "rtl"
				? "row-reverse"
				: "row",
		"--manga-page-gap": twoPageSpread ? "clamp(0px, 0.75vw, 12px)" : "0px",
	} as CSSProperties;
	const pageGap = twoPageSpread ? Math.min(12, viewport.width * 0.0075) : 0;
	const pageStyle = (page: MangaPage): CSSProperties | undefined => {
		if (!page.geometry || !page.aspectRatio) return undefined;
		if (horizontalStrip) {
			return {
				width: (viewport.height * page.geometry.width) / page.geometry.height,
				height: viewport.height,
				aspectRatio: page.aspectRatio,
				flex: "none",
			};
		}
		if (verticalStrip) {
			const width = Math.min(viewport.width, 1200);
			return {
				width,
				height: (width * page.geometry.height) / page.geometry.width,
				aspectRatio: page.aspectRatio,
				flex: "none",
			};
		}
		const pageCount = twoPageSpread && visiblePages.length > 1 ? 2 : 1;
		const fitted = fitMangaPage(page.geometry, {
			width: (viewport.width - pageGap) / pageCount,
			height: viewport.height,
		});
		return {
			...fitted,
			aspectRatio: page.aspectRatio,
			flex: "none",
		};
	};

	return (
		<div
			ref={readerRef}
			className={`book-content book-content--manga relative h-dvh w-dvw ${verticalStrip ? "book-content--manga-continuous overflow-y-auto" : horizontalStrip ? "book-content--manga-horizontal-strip overflow-x-auto overflow-y-hidden" : "overflow-hidden"}`}
			style={{
				backgroundColor: theme.backgroundColor,
				touchAction: verticalStrip
					? "pan-y pinch-zoom"
					: horizontalStrip
						? "pan-x pinch-zoom"
						: "pan-y",
			}}
			onScroll={strip ? onContinuousScroll : undefined}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={finishPointer}
			onPointerCancel={cancelPointer}
		>
			<div
				ref={canvasRef}
				className={`manga-page-canvas flex items-center justify-center ${verticalStrip ? "manga-page-canvas--continuous min-h-full w-full" : horizontalStrip ? "manga-page-canvas--horizontal-strip h-full w-max min-w-full" : "h-full w-full"}`}
				style={canvasStyle}
			>
				{renderedPages.map((pageIndex) => {
					const page = pages[pageIndex];
					if (!page) return null;
					return (
						<div
							key={page.reference}
							ref={(element) => {
								if (element) pageSlotsRef.current.set(pageIndex, element);
								else pageSlotsRef.current.delete(pageIndex);
							}}
							data-manga-page-index={pageIndex}
							className="manga-page-slot relative"
							style={pageStyle(page)}
						>
							{/* biome-ignore lint/security/noDangerouslySetInnerHtml: source was sanitized before entering ReaderBookData */}
							<div dangerouslySetInnerHTML={{ __html: page.html }} />
							{bookmarkedPage === pageIndex && (
								<BookmarkSimple
									weight="fill"
									className="absolute top-[max(0.75rem,var(--safe-area-top))] right-[max(0.75rem,var(--safe-area-right))] size-5 drop-shadow-md"
									style={{ color: theme.fontColor }}
								/>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
