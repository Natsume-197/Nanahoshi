import { useDocumentState } from "@embedpdf/core/react";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";
import { useCallback, useSyncExternalStore } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { PdfPageImageStore } from "./pdf-page-images";
import { type BitmapPageImage, pdfPageRenderScale } from "./pdf-render-lanes";

export type PdfBitmapStore = PdfPageImageStore<BitmapPageImage>;

/** Whole-page raster from the shared render lanes; tiles only past the size cap. */
export function PdfPageRaster({
	documentId,
	pageIndex,
	store,
}: {
	documentId: string;
	pageIndex: number;
	store: PdfBitmapStore;
}) {
	const documentState = useDocumentState(documentId);
	const page = documentState?.document?.pages[pageIndex];
	const zoom = documentState?.scale ?? 1;
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
			return () => {
				observer.disconnect();
				store.setVisible(pageIndex, false);
			};
		},
		[store, pageIndex],
	);

	return (
		<div ref={observe} className="absolute inset-0 select-none">
			{image && <canvas ref={draw} className="block size-full" />}
			{scale > 0 && (
				<PdfPageRequest
					key={scale}
					store={store}
					pageIndex={pageIndex}
					scale={scale}
				/>
			)}
			{needsTiles && (
				<TilingLayer
					documentId={documentId}
					pageIndex={pageIndex}
					className="pointer-events-none absolute inset-0 overflow-hidden"
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
