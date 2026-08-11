import { createPdfiumDirectEngine } from "@embedpdf/engines";
import pdfiumWasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import type { EbookDocument } from "../ebook";
import { openPdfEbookDocument, pdfDocumentId } from "./document";

export async function openPdfDocument(blob: Blob): Promise<EbookDocument> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	if (typeof window === "undefined") {
		const nodeModulePath = "./node";
		const { openPdfBytes } = await import(/* @vite-ignore */ nodeModulePath);
		return openPdfBytes(bytes);
	}
	const engine = await createPdfiumDirectEngine(pdfiumWasmUrl, {
		encoderPoolSize: 2,
		fontFallback: null,
	});
	return openPdfEbookDocument(
		engine,
		{
			id: await pdfDocumentId(bytes),
			content: bytes.buffer,
		},
		async (image) => new Uint8Array(await image.arrayBuffer()),
	);
}
