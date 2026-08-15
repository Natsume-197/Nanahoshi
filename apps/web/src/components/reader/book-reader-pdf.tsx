import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { DocumentContent } from "@embedpdf/plugin-document-manager/react";
import {
	GlobalPointerProvider,
	PagePointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import { usePan } from "@embedpdf/plugin-pan/react";
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
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import {
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWindowEvent } from "@/hooks/use-window-event";
import {
	createPdfSections,
	type PdfReaderSource,
} from "@/lib/reader/pdf-source";
import type { ReaderTheme } from "@/lib/reader/settings";
import type {
	ReaderPosition,
	Section,
	SectionWithProgress,
} from "@/lib/reader/types";
import { PdfNavigationToolbar } from "./pdf-navigation-toolbar";
import { createPdfReaderConfig } from "./pdf-reader-config";
import { PdfSearchPanel } from "./pdf-search-panel";
import {
	type PdfLayoutMode,
	positionForPdfPage,
	stepPdfPage,
} from "./pdf-view-state";
import { readerMix } from "./reader-controls";
import type { BookReaderApi } from "./reader-shared-props";
import { usePdfNavigation } from "./use-pdf-navigation";
import "./pdf-reader.css";

const PDF_PROGRESS_REPORT_DELAY_MS = 100;

interface BookReaderPdfProps {
	source: PdfReaderSource;
	theme: ReaderTheme;
	sections: Section[];
	initialPosition: ReaderPosition | undefined;
	onExploredCharCountChange: (count: number) => void;
	onSectionProgressChange: (progress: Map<string, SectionWithProgress>) => void;
	onToggleChrome: () => void;
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
		<div className="fixed inset-0 overflow-hidden" style={surfaceStyle}>
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
	sections,
	initialPosition,
	onExploredCharCountChange,
	onSectionProgressChange,
	onToggleChrome,
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
	const { provides: pan } = usePan(documentId);
	const { provides: spread } = useSpread(documentId);
	const [layout, setLayout] = useState<PdfLayoutMode>("page");
	const [searchOpen, setSearchOpen] = useState(false);
	const currentPageRef = useRef(1);
	const currentLayoutRef = useRef<PdfLayoutMode>("page");
	const callbacksRef = useRef({
		onExploredCharCountChange,
		onSectionProgressChange,
		onDocumentReady,
		apiRef,
	});
	const documentSections = useMemo(
		() =>
			sections.length === pageCount ? sections : createPdfSections(pageCount),
		[pageCount, sections],
	);
	currentPageRef.current = currentPage;
	currentLayoutRef.current = layout;
	callbacksRef.current = {
		onExploredCharCountChange,
		onSectionProgressChange,
		onDocumentReady,
		apiRef,
	};
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

	useEffect(() => {
		callbacksRef.current.onDocumentReady?.(pageCount);
	}, [pageCount]);

	useEffect(() => {
		if (!positionReady) return;
		const timer = window.setTimeout(() => {
			callbacksRef.current.onExploredCharCountChange(currentPage);
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
	}, [currentPage, documentSections, positionReady]);

	useEffect(() => {
		const readerApi: BookReaderApi = {
			nextPage: () => turnPage(1),
			prevPage: () => turnPage(-1),
			navigateToSection: (reference) => {
				const pageNumber = Number.parseInt(
					reference.replace("pdf-page-", ""),
					10,
				);
				if (Number.isFinite(pageNumber)) goToPage(pageNumber);
			},
			getPosition: () => positionForPdfPage(currentPageRef.current, pageCount),
			scrollToPosition: (position) => goToPage(position.exploredCharCount),
			relayout: () =>
				zoom?.requestZoom(
					currentLayoutRef.current === "continuous"
						? ZoomMode.FitWidth
						: ZoomMode.FitPage,
				),
			openSearch: () => setSearchOpen(true),
		};
		callbacksRef.current.apiRef(readerApi);
		return () => callbacksRef.current.apiRef(null);
	}, [goToPage, pageCount, turnPage, zoom]);

	useWindowEvent("keydown", (event) => {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
			event.preventDefault();
			setSearchOpen(true);
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
				currentLayoutRef.current === "continuous"
					? ZoomMode.FitWidth
					: ZoomMode.FitPage,
			);
		} else if (event.shiftKey && event.code === "KeyR") {
			event.preventDefault();
			rotate?.rotateForward();
		}
	});

	const handleLayoutChange = useCallback(
		(nextLayout: PdfLayoutMode) => {
			const page = currentPageRef.current;
			setLayout(nextLayout);
			pan?.disablePan();
			spread?.setSpreadMode(
				nextLayout === "spread" ? SpreadMode.Even : SpreadMode.None,
			);
			scrollCapability?.setScrollStrategy(ScrollStrategy.Vertical, documentId);
			zoom?.requestZoom(
				nextLayout === "continuous" ? ZoomMode.FitWidth : ZoomMode.FitPage,
			);
			requestAnimationFrame(() => goToPage(page, "instant"));
		},
		[documentId, goToPage, pan, scrollCapability, spread, zoom],
	);
	const handlePageClick = useCallback(
		(event: ReactMouseEvent) => {
			if ((event.target as HTMLElement).closest("button, input")) return;
			if (window.getSelection()?.toString().trim()) return;
			onToggleChrome();
		},
		[onToggleChrome],
	);
	const searchMatch = readerMix(theme, 24);
	const activeSearchMatch = readerMix(theme, 48);
	const selectionColor = readerMix(theme, 35);
	const renderPage = useCallback(
		({ pageIndex }: { pageIndex: number }) => (
			<Rotate
				documentId={documentId}
				pageIndex={pageIndex}
				className="nanahoshi-pdf-page overflow-hidden bg-white"
				onClick={handlePageClick}
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
					<SelectionLayer
						documentId={documentId}
						pageIndex={pageIndex}
						textStyle={{ background: selectionColor }}
					/>
				</PagePointerProvider>
			</Rotate>
		),
		[
			activeSearchMatch,
			documentId,
			handlePageClick,
			pageCount,
			searchMatch,
			selectionColor,
		],
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
							className="nanahoshi-pdf-scroller pb-24"
							renderPage={renderPage}
						/>
					</ZoomGestureWrapper>
				</Viewport>
			</GlobalPointerProvider>

			{layout !== "continuous" && (
				<>
					<Button
						variant="secondary"
						size="icon-lg"
						aria-label="Previous PDF page"
						className="absolute top-1/2 left-2 z-2 -translate-y-1/2 rounded-full shadow-lg"
						disabled={currentPage <= 1}
						onClick={() => turnPage(-1)}
					>
						<CaretLeft aria-hidden="true" />
					</Button>
					<Button
						variant="secondary"
						size="icon-lg"
						aria-label="Next PDF page"
						className="absolute top-1/2 right-2 z-2 -translate-y-1/2 rounded-full shadow-lg"
						disabled={currentPage >= pageCount}
						onClick={() => turnPage(1)}
					>
						<CaretRight aria-hidden="true" />
					</Button>
				</>
			)}

			<PdfNavigationToolbar
				documentId={documentId}
				theme={theme}
				layout={layout}
				pageNumber={currentPage}
				pageCount={pageCount}
				onLayoutChange={handleLayoutChange}
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
