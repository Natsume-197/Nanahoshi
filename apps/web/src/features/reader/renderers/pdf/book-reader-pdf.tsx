import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { AnnotationLayer } from "@embedpdf/plugin-annotation/react";
import { DocumentContent } from "@embedpdf/plugin-document-manager/react";
import {
	GlobalPointerProvider,
	PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import { usePanPlugin } from "@embedpdf/plugin-pan/react";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { Rotate, useRotate } from "@embedpdf/plugin-rotate/react";
import {
	Scroller,
	ScrollStrategy,
	useScrollCapability,
} from "@embedpdf/plugin-scroll/react";
import { SearchLayer } from "@embedpdf/plugin-search/react";
import { SelectionLayer } from "@embedpdf/plugin-selection/react";
import { SpreadMode, useSpread } from "@embedpdf/plugin-spread/react";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import {
	useZoom,
	ZoomGestureWrapper,
	ZoomMode,
} from "@embedpdf/plugin-zoom/react";
import {
	type CSSProperties,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	createPdfSections,
	type PdfReaderSource,
} from "@/features/reader/document/pdf-source";
import type {
	ReaderPosition,
	Section,
	SectionWithProgress,
} from "@/features/reader/document/types";
import { usePdfNavigation } from "@/features/reader/interaction/use-pdf-navigation";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import { readerMix } from "@/features/reader/ui/controls/reader-controls";
import { useWindowEvent } from "@/hooks/use-window-event";
import { PdfNavigationToolbar } from "./pdf-navigation-toolbar";
import { PdfPageNavigator } from "./pdf-page-navigator";
import { createPdfReaderConfig } from "./pdf-reader-config";
import { PdfSearchPanel } from "./pdf-search-panel";
import {
	type PdfLayoutMode,
	type PdfScrollDirection,
	positionForPdfPage,
	stepPdfPage,
} from "./pdf-view-state";
import "./pdf-reader.css";

const PDF_PROGRESS_REPORT_DELAY_MS = 100;
// PDF pages are commonly light even when the reader chrome is dark. This
// translucent blue remains legible on both, unlike a theme-mixed neutral.
const PDF_SELECTION_COLOR = "rgba(59, 130, 246, 0.42)";

interface BookReaderPdfProps {
	source: PdfReaderSource;
	theme: ReaderTheme;
	sections: Section[];
	initialPosition: ReaderPosition | undefined;
	onPositionChange: (position: ReaderPosition) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	onExit: () => void;
	onCompleteBook: () => void;
	onFullscreen: () => void;
	onOpenSettings: () => void;
	onDocumentReady?: (pageCount: number) => void;
	apiRef: (api: BookReaderApi | null) => void;
}

export function BookReaderPdf(props: BookReaderPdfProps) {
	const { source, theme } = props;
	const readerConfig = useMemo(
		() =>
			createPdfReaderConfig({
				wasmUrl: pdfiumWasmUrl,
				baseUrl: typeof document === "undefined" ? undefined : document.baseURI,
				source: { name: source.name, url: source.url },
			}),
		[source.name, source.url],
	);
	const { engine, isLoading, error } = usePdfiumEngine(readerConfig.engine);
	const surfaceStyle = {
		backgroundColor: theme.backgroundColor,
		color: theme.fontColor,
		"--pdf-page-outline": readerMix(theme, 13),
		"--pdf-page-shadow": readerMix(theme, 20),
	} as CSSProperties;

	if (error) {
		return <PdfFailureState message={error.message} style={surfaceStyle} />;
	}
	if (isLoading || !engine) {
		return (
			<PdfLoadingState
				label="Starting PDFium…"
				previewUrl={source.previewUrl}
				style={surfaceStyle}
			/>
		);
	}

	return (
		<div
			data-reader-renderer="pdf"
			className="fixed inset-0 overflow-hidden"
			style={surfaceStyle}
		>
			<EmbedPDF engine={engine} plugins={readerConfig.plugins}>
				{({ activeDocumentId, pluginsReady }) => {
					if (!pluginsReady) {
						return (
							<PdfLoadingState
								label="Preparing the reader…"
								previewUrl={source.previewUrl}
							/>
						);
					}
					if (!activeDocumentId) {
						return (
							<PdfLoadingState
								label="Opening PDF…"
								previewUrl={source.previewUrl}
							/>
						);
					}
					return (
						<DocumentContent documentId={activeDocumentId}>
							{({ documentState, isError, isLoaded, isLoading: loading }) => {
								if (isError) {
									return (
										<PdfFailureState
											message={documentState.error ?? "Could not open this PDF"}
										/>
									);
								}
								if (loading || !isLoaded || !documentState.document) {
									return (
										<PdfLoadingState
											label="Reading the document…"
											previewUrl={source.previewUrl}
										/>
									);
								}
								return (
									<PdfDocumentViewport
										{...props}
										documentId={activeDocumentId}
										pageCount={documentState.document.pageCount}
									/>
								);
							}}
						</DocumentContent>
					);
				}}
			</EmbedPDF>
		</div>
	);
}

interface PdfDocumentViewportProps extends BookReaderPdfProps {
	documentId: string;
	pageCount: number;
}

function PdfDocumentViewport({
	documentId,
	pageCount,
	theme,
	source,
	initialPosition,
	onPositionChange,
	onSectionProgressChange,
	onExit,
	onCompleteBook,
	onFullscreen,
	onOpenSettings,
	onDocumentReady,
	apiRef,
}: PdfDocumentViewportProps) {
	const { currentPage, goToPage, positionReady } = usePdfNavigation(
		documentId,
		pageCount,
		initialPosition?.exploredCharCount,
	);
	const { provides: scrollCapability } = useScrollCapability();
	const { provides: zoom } = useZoom(documentId);
	const { provides: rotate } = useRotate(documentId);
	const { provides: spread } = useSpread(documentId);
	const { plugin: panPlugin } = usePanPlugin();
	// `usePan()` in EmbedPDF 2.15 derives a new capability on each render and
	// subscribes to it from an effect. Keep one stable capability per plugin so
	// switching the tool does not turn viewport updates into React rerenders.
	const pan = useMemo(() => panPlugin?.provides() ?? null, [panPlugin]);
	const [isPanning, setIsPanning] = useState(false);
	const [layout, setLayout] = useState<PdfLayoutMode>("page");
	const [scrollDirection, setScrollDirection] =
		useState<PdfScrollDirection>("vertical");
	const [searchOpen, setSearchOpen] = useState(false);
	const [navigatorOpen, setNavigatorOpen] = useState(false);
	const currentPageRef = useRef(1);
	const currentLayoutRef = useRef<PdfLayoutMode>("page");
	const scrollDirectionRef = useRef<PdfScrollDirection>("vertical");
	const goToPageRef = useRef(goToPage);
	const turnPageRef = useRef<(direction: -1 | 1) => void>(() => {});
	const zoomRef = useRef(zoom);
	const cancelPresentationRestoreRef = useRef<(() => void) | null>(null);
	const callbacksRef = useRef({
		onPositionChange,
		onSectionProgressChange,
		onDocumentReady,
		apiRef,
	});
	// A PDF's canonical reading units are its pages. Deriving this stable list
	// from the document prevents parent progress updates from recreating the
	// reader API and feeding back into the viewport on every render.
	const documentSections = useMemo(
		() => createPdfSections(pageCount),
		[pageCount],
	);
	currentPageRef.current = currentPage;
	currentLayoutRef.current = layout;
	scrollDirectionRef.current = scrollDirection;
	goToPageRef.current = goToPage;
	zoomRef.current = zoom;
	callbacksRef.current = {
		onPositionChange,
		onSectionProgressChange,
		onDocumentReady,
		apiRef,
	};
	useEffect(() => {
		if (!pan) {
			setIsPanning(false);
			return;
		}
		const scope = pan.forDocument(documentId);
		setIsPanning(scope.isPanMode());
		return scope.onPanModeChange(setIsPanning);
	}, [documentId, pan]);
	useEffect(
		() => () => {
			cancelPresentationRestoreRef.current?.();
		},
		[],
	);
	const turnPage = useCallback(
		(direction: -1 | 1) => {
			const targetIndex = stepPdfPage(
				currentPageRef.current - 1,
				pageCount,
				currentLayoutRef.current,
				direction,
			);
			goToPage(targetIndex + 1);
		},
		[goToPage, pageCount],
	);
	turnPageRef.current = turnPage;

	useEffect(() => {
		callbacksRef.current.onDocumentReady?.(pageCount);
	}, [pageCount]);

	useEffect(() => {
		if (!positionReady) return;
		const timer = window.setTimeout(() => {
			callbacksRef.current.onPositionChange(
				positionForPdfPage(currentPage, pageCount, documentSections),
			);
			const sectionProgress = new Map<string, SectionWithProgress>();
			for (const [index, section] of documentSections.entries()) {
				sectionProgress.set(section.reference, {
					...section,
					progress: index < currentPage - 1 ? 100 : 0,
				});
			}
			callbacksRef.current.onSectionProgressChange(sectionProgress);
		}, PDF_PROGRESS_REPORT_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [currentPage, documentSections, pageCount, positionReady]);

	useEffect(() => {
		const readerApi: BookReaderApi = {
			nextPage: () => turnPageRef.current(1),
			prevPage: () => turnPageRef.current(-1),
			navigateToSection: (reference) => {
				const pageNumber = Number.parseInt(
					reference.replace("pdf-page-", ""),
					10,
				);
				if (Number.isFinite(pageNumber)) goToPageRef.current(pageNumber);
			},
			getPosition: () =>
				positionForPdfPage(currentPageRef.current, pageCount, documentSections),
			scrollToPosition: (position) =>
				goToPageRef.current(position.exploredCharCount),
			relayout: () =>
				zoomRef.current?.requestZoom(
					currentLayoutRef.current === "page" &&
						scrollDirectionRef.current === "vertical"
						? ZoomMode.FitWidth
						: ZoomMode.FitPage,
				),
			openSearch: () => setSearchOpen(true),
		};
		callbacksRef.current.apiRef(readerApi);
		return () => callbacksRef.current.apiRef(null);
	}, [documentSections, pageCount]);

	useWindowEvent("keydown", (event) => {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
			event.preventDefault();
			setSearchOpen(true);
			return;
		}
		if (event.key === "Escape" && navigatorOpen) {
			event.preventDefault();
			setNavigatorOpen(false);
			return;
		}
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'input, textarea, select, button, a, [contenteditable="true"]',
			)
		)
			return;
		if (event.key === "+" || event.key === "=") {
			event.preventDefault();
			zoom?.zoomIn();
		} else if (event.key === "-") {
			event.preventDefault();
			zoom?.zoomOut();
		} else if (event.key === "0") {
			event.preventDefault();
			zoom?.requestZoom(
				currentLayoutRef.current === "page" && scrollDirection === "vertical"
					? ZoomMode.FitWidth
					: ZoomMode.FitPage,
			);
		} else if (event.shiftKey && event.code === "KeyR") {
			event.preventDefault();
			rotate?.rotateForward();
		}
	});

	const handlePresentationChange = useCallback(
		({
			nextLayout = currentLayoutRef.current,
			nextScrollDirection = scrollDirection,
		}: {
			nextLayout?: PdfLayoutMode;
			nextScrollDirection?: PdfScrollDirection;
		}) => {
			const page = currentPageRef.current;
			cancelPresentationRestoreRef.current?.();
			let layoutChangeRequested = false;
			let restored = false;
			let fallbackTimer: number | undefined;
			let unsubscribe: (() => void) | undefined;
			const cancelRestore = () => {
				if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
				unsubscribe?.();
				if (cancelPresentationRestoreRef.current === cancelRestore) {
					cancelPresentationRestoreRef.current = null;
				}
			};
			const restorePage = () => {
				if (restored) return;
				restored = true;
				cancelRestore();
				goToPageRef.current(page, "instant");
			};
			unsubscribe = scrollCapability?.onLayoutReady((event) => {
				if (layoutChangeRequested && event.documentId === documentId) {
					restorePage();
				}
			});
			if (restored) unsubscribe?.();
			cancelPresentationRestoreRef.current = cancelRestore;
			layoutChangeRequested = true;
			setLayout(nextLayout);
			setScrollDirection(nextScrollDirection);
			pan?.disablePan();
			spread?.setSpreadMode(
				nextLayout === "spread-even"
					? SpreadMode.Even
					: nextLayout === "spread-odd"
						? SpreadMode.Odd
						: SpreadMode.None,
			);
			scrollCapability?.setScrollStrategy(
				nextScrollDirection === "horizontal"
					? ScrollStrategy.Horizontal
					: ScrollStrategy.Vertical,
				documentId,
			);
			zoom?.requestZoom(
				nextLayout === "page" && nextScrollDirection === "vertical"
					? ZoomMode.FitWidth
					: ZoomMode.FitPage,
			);
			// Layout events are the normal path. The timeout only protects against an
			// engine implementation that does not emit one for an unchanged setting.
			if (!restored) fallbackTimer = window.setTimeout(restorePage, 500);
		},
		[documentId, pan, scrollCapability, scrollDirection, spread, zoom],
	);
	const searchMatch = readerMix(theme, 24);
	const activeSearchMatch = readerMix(theme, 48);
	const renderPage = useCallback(
		({ pageIndex }: { pageIndex: number }) => (
			<Rotate
				documentId={documentId}
				pageIndex={pageIndex}
				className="nanahoshi-pdf-page overflow-hidden bg-white"
			>
				<PagePointerProvider
					documentId={documentId}
					pageIndex={pageIndex}
					role="article"
					aria-label={`PDF page ${pageIndex + 1} of ${pageCount}`}
					className="relative size-full"
				>
					<RenderLayer
						documentId={documentId}
						pageIndex={pageIndex}
						scale={1}
						className="absolute inset-0 block select-none"
					/>
					<TilingLayer
						documentId={documentId}
						pageIndex={pageIndex}
						className="pointer-events-none absolute inset-0 overflow-hidden"
					/>
					<SearchLayer
						documentId={documentId}
						pageIndex={pageIndex}
						highlightColor={searchMatch}
						activeHighlightColor={activeSearchMatch}
						className="absolute inset-0"
					/>
					<AnnotationLayer
						documentId={documentId}
						pageIndex={pageIndex}
						className="absolute inset-0"
					/>
					<SelectionLayer
						documentId={documentId}
						pageIndex={pageIndex}
						textStyle={{ background: PDF_SELECTION_COLOR }}
					/>
				</PagePointerProvider>
			</Rotate>
		),
		[activeSearchMatch, documentId, pageCount, searchMatch],
	);

	return (
		<>
			<GlobalPointerProvider documentId={documentId} className="size-full">
				<Viewport
					documentId={documentId}
					aria-label="PDF document viewport"
					className="nanahoshi-pdf-viewport outline-none"
					tabIndex={-1}
				>
					<ZoomGestureWrapper
						documentId={documentId}
						className="min-h-full min-w-full"
					>
						<Scroller
							documentId={documentId}
							className="nanahoshi-pdf-scroller pt-[calc(3.25rem+var(--safe-area-top))] pb-8 sm:pt-[calc(3rem+var(--safe-area-top))]"
							renderPage={renderPage}
						/>
					</ZoomGestureWrapper>
				</Viewport>
			</GlobalPointerProvider>

			<PdfNavigationToolbar
				documentId={documentId}
				theme={theme}
				layout={layout}
				scrollDirection={scrollDirection}
				pageNumber={currentPage}
				pageCount={pageCount}
				documentTitle={source.name.replace(/\.pdf$/i, "")}
				sidebarOpen={navigatorOpen}
				onSidebarToggle={() => setNavigatorOpen((open) => !open)}
				onPageChange={(page) => goToPage(page)}
				onPreviousPage={() => turnPage(-1)}
				onNextPage={() => turnPage(1)}
				onOpenSearch={() => setSearchOpen(true)}
				onCompleteBook={onCompleteBook}
				onFullscreen={onFullscreen}
				onOpenSettings={onOpenSettings}
				onExit={onExit}
				onLayoutChange={(nextLayout) =>
					handlePresentationChange({ nextLayout })
				}
				onScrollDirectionChange={(nextScrollDirection) =>
					handlePresentationChange({ nextScrollDirection })
				}
				isPanning={isPanning}
				onInteractionToolChange={(tool) => {
					if (tool === "pan") pan?.enablePan();
					else pan?.disablePan();
				}}
			/>
			<PdfPageNavigator
				documentId={documentId}
				open={navigatorOpen}
				theme={theme}
				pageNumber={currentPage}
				pageCount={pageCount}
				onClose={() => setNavigatorOpen(false)}
				onPageChange={(page) => {
					goToPage(page);
					setNavigatorOpen(false);
				}}
			/>
			{searchOpen && (
				<PdfSearchPanel
					documentId={documentId}
					theme={theme}
					pageCount={pageCount}
					onClose={() => setSearchOpen(false)}
				/>
			)}
		</>
	);
}

function PdfLoadingState({
	label,
	previewUrl,
	style,
}: {
	label: string;
	previewUrl?: string;
	style?: CSSProperties;
}) {
	return (
		<div
			className="fixed inset-0 flex flex-col items-center justify-center gap-4"
			style={style}
			role="status"
			aria-live="polite"
		>
			{previewUrl ? (
				<img
					src={previewUrl}
					alt=""
					className="aspect-[3/4] h-[min(62dvh,34rem)] rounded-sm object-cover shadow-2xl"
				/>
			) : (
				<Skeleton className="aspect-[3/4] h-[min(62dvh,34rem)] rounded-sm" />
			)}
			<p className="text-muted-foreground text-sm">{label}</p>
		</div>
	);
}

function PdfFailureState({
	message,
	style,
}: {
	message: string;
	style?: CSSProperties;
}) {
	return (
		<div
			className="fixed inset-0 flex items-center justify-center p-6"
			style={style}
		>
			<p role="alert" className="max-w-md text-center text-destructive">
				{message}
			</p>
		</div>
	);
}
