import { useDocumentState } from "@embedpdf/core/react";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";
import { useCallback, useSyncExternalStore } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { PdfPageImageStore } from "./pdf-page-images";
import type { PdfPageToneLayers } from "./pdf-page-tone";
import { type BitmapPageImage, pdfPageRenderScale } from "./pdf-render-lanes";

export type PdfBitmapStore = PdfPageImageStore<BitmapPageImage>;

/** Whole-page raster from the shared render lanes; tiles only past the size cap. */
export function PdfPageRaster({
	documentId,
	pageIndex,
	store,
	zoom,
	tone,
}: {
	documentId: string;
	pageIndex: number;
	store: PdfBitmapStore;
	/** Settled zoom: follows the viewer, but not through every step of a burst. */
	zoom: number;
	/** Recolours the page to the reader theme; omitted shows it as printed. */
	tone?: PdfPageToneLayers;
}) {
	const documentState = useDocumentState(documentId);
	const page = documentState?.document?.pages[pageIndex];
	const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio;
	const scale = page ? pdfPageRenderScale(page.size, zoom, dpr) : 0;
	const needsTiles = zoom * Math.max(1, dpr) > scale * 1.01;

	const subscribe = useCallback(
		(notify: () => void) => store.subscribe(pageIndex, notify),
		[store, pageIndex],
	);
	const image = useSyncExternalStore(
		subscribe,
		() => store.best(pageIndex),
		() => undefined,
	);
	const draw = useCallback(
		(canvas: HTMLCanvasElement | null) => {
			if (!canvas || !image) return;
			canvas.width = image.width;
			canvas.height = image.height;
			canvas.getContext("2d", { alpha: false })?.drawImage(image.bitmap, 0, 0);
		},
		[image],
	);
	const observe = useCallback(
		(element: HTMLDivElement | null) => {
			if (!element) return;
			const observer = new IntersectionObserver(([entry]) =>
				store.setVisible(pageIndex, entry?.isIntersecting ?? false),
			);
			observer.observe(element);
			// Zooming remounts pages; clearing here would leave the store blind to
			// what is on screen for a frame. The observer reports real exits.
			return () => observer.disconnect();
		},
		[store, pageIndex],
	);

	return (
		<div ref={observe} className="absolute inset-0 select-none">
			<div
				className="absolute inset-0"
				style={tone && image ? { filter: tone.filter } : undefined}
			>
				{image && <canvas ref={draw} className="block size-full" />}
				{needsTiles && (
					<TilingLayer
						documentId={documentId}
						pageIndex={pageIndex}
						className="pointer-events-none absolute inset-0 overflow-hidden"
					/>
				)}
			</div>
			{image &&
				tone?.layers.map((layer, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed two-layer stack
						key={index}
						aria-hidden="true"
						className="pointer-events-none absolute inset-0"
						style={layer}
					/>
				))}
			{scale > 0 && (
				<PdfPageRequest
					key={scale}
					store={store}
					pageIndex={pageIndex}
					scale={scale}
				/>
			)}
		</div>
	);
}

function PdfPageRequest({
	store,
	pageIndex,
	scale,
}: {
	store: PdfBitmapStore;
	pageIndex: number;
	scale: number;
}) {
	useMountEffect(() => store.request(pageIndex, scale));
	return null;
}

/** Navigator thumbnail drawn from the shared page store's cheapest image. */
export function PdfPageThumbnail({
	store,
	pageIndex,
	width,
	height,
}: {
	store: PdfBitmapStore;
	pageIndex: number;
	width: number;
	height: number;
}) {
	const subscribe = useCallback(
		(notify: () => void) => store.subscribe(pageIndex, notify),
		[store, pageIndex],
	);
	const image = useSyncExternalStore(
		subscribe,
		() => store.best(pageIndex),
		() => undefined,
	);
	const draw = useCallback(
		(canvas: HTMLCanvasElement | null) => {
			if (!canvas || !image) return;
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			const context = canvas.getContext("2d", { alpha: false });
			if (!context) return;
			context.imageSmoothingQuality = "high";
			context.drawImage(image.bitmap, 0, 0, canvas.width, canvas.height);
		},
		[image, width, height],
	);
	return (
		<>
			{image && <canvas ref={draw} className="block size-full" />}
			<PdfThumbnailRequest store={store} pageIndex={pageIndex} />
		</>
	);
}

function PdfThumbnailRequest({
	store,
	pageIndex,
}: {
	store: PdfBitmapStore;
	pageIndex: number;
}) {
	useMountEffect(() => store.requestThumbnail(pageIndex));
	return null;
}
