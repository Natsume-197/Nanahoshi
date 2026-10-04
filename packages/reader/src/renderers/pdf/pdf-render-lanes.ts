import type {
	ImageDataLike,
	PdfDocumentObject,
	PdfEngine,
	Size,
} from "@embedpdf/models";
import type { PdfPageImage, PdfRenderLane } from "./pdf-page-images";

// Past this, zooming in hands sharpness to the tiling layer instead of
// rasterizing ever larger whole pages.
export const MAX_PAGE_RENDER_PIXELS = 8_000_000;
const PREVIEW_LONG_SIDE_PX = 360;

/** Device pixels per PDF point for a page shown at `zoom` on a `dpr` screen. */
export function pdfPageRenderScale(size: Size, zoom: number, dpr: number) {
	const wanted = zoom * Math.max(1, dpr);
	const cap = Math.sqrt(MAX_PAGE_RENDER_PIXELS / (size.width * size.height));
	return Math.round(Math.min(wanted, cap) * 1000) / 1000;
}

export function pdfPagePreviewScale(size: Size) {
	return PREVIEW_LONG_SIDE_PX / Math.max(size.width, size.height, 1);
}

/**
 * PDFium is single-threaded, so each extra lane is another worker with its own
 * copy of the document. Weak or memory-tight devices keep the single engine.
 */
export function extraPdfRenderLaneCount({
	cores,
	memoryGb,
}: {
	cores: number | undefined;
	memoryGb: number | undefined;
}) {
	const byCores = Math.floor(((cores ?? 2) - 2) / 2);
	const byMemory = (memoryGb ?? 4) >= 8 ? 2 : (memoryGb ?? 4) >= 4 ? 1 : 0;
	return Math.max(0, Math.min(2, byCores, byMemory));
}

export class BitmapPageImage implements PdfPageImage {
	constructor(readonly bitmap: ImageBitmap) {}
	get width() {
		return this.bitmap.width;
	}
	get height() {
		return this.bitmap.height;
	}
	close() {
		this.bitmap.close();
	}
}

export function createEngineLane(
	engine: PdfEngine,
	document: PdfDocumentObject,
): PdfRenderLane<BitmapPageImage> {
	return {
		render: (pageIndex, scale) =>
			new Promise<ImageDataLike>((resolve, reject) => {
				const page = document.pages[pageIndex];
				if (!page) {
					reject(new Error(`PDF page ${pageIndex} does not exist`));
					return;
				}
				// Raw pixels skip EmbedPDF's PNG encode and the blob round trip.
				engine
					.renderPageRaw(document, page, { scaleFactor: scale, dpr: 1 })
					.wait(resolve, reject);
			}).then(
				async (raw) =>
					new BitmapPageImage(
						await createImageBitmap(
							new ImageData(raw.data, raw.width, raw.height),
						),
					),
			),
	};
}

/** Opens `count` extra PDFium workers on the same bytes. Returns their shutdown. */
export function openExtraEngineLanes({
	count,
	wasmUrl,
	buffer,
	onLane,
}: {
	count: number;
	wasmUrl: string;
	buffer: ArrayBuffer;
	onLane: (lane: PdfRenderLane<BitmapPageImage>) => () => void;
}): () => void {
	let closed = false;
	const shutdowns: (() => void)[] = [];
	void (async () => {
		if (count <= 0) return;
		const { createPdfiumEngine } = await import(
			"@embedpdf/engines/pdfium-worker-engine"
		);
		for (let index = 0; index < count && !closed; index++) {
			const engine = createPdfiumEngine(wasmUrl, { fontFallback: null });
			shutdowns.push(() => engine.destroy?.());
			// The worker receives a structured clone; the source buffer stays usable.
			engine
				.openDocumentBuffer({ id: `render-lane-${index}`, content: buffer })
				.wait(
					(document) => {
						if (!closed)
							shutdowns.push(onLane(createEngineLane(engine, document)));
					},
					() => {},
				);
		}
	})();
	return () => {
		closed = true;
		for (const shutdown of shutdowns.splice(0).reverse()) shutdown();
	};
}
