import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PdfEngine, PdfiumNative } from "@embedpdf/engines";
import { createCustomImageDataToBufferConverter } from "@embedpdf/engines/converters";
import type { PdfImage } from "@embedpdf/models";
import { init } from "@embedpdf/pdfium";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import type { EbookDocument } from "../ebook";
import { openPdfEbookDocument, pdfDocumentId } from "./document";

const pdfiumWasmBinary = fs.readFile(
	fileURLToPath(import.meta.resolve("@embedpdf/pdfium/pdfium.wasm")),
);

export async function openPdfFile(filePath: string): Promise<EbookDocument> {
	return openPdfBytes(await fs.readFile(filePath));
}

export async function openPdfBytes(input: Uint8Array): Promise<EbookDocument> {
	const content = Uint8Array.from(input);
	const [documentId, wasmBinary] = await Promise.all([
		pdfDocumentId(content),
		pdfiumWasmBinary,
	]);
	const module = await init({ wasmBinary });
	const executor = new PdfiumNative(module, { fontFallback: null });
	const imageConverter = createCustomImageDataToBufferConverter(
		async (image: PdfImage) => {
			const canvas = createCanvas(image.width, image.height);
			const context = canvas.getContext("2d");
			context.putImageData(
				new ImageData(image.data, image.width, image.height),
				0,
				0,
			);
			return canvas.encode("png");
		},
	);
	const engine = new PdfEngine(executor, { imageConverter });
	return openPdfEbookDocument(
		engine,
		{ id: documentId, content: content.buffer },
		async (image) => Uint8Array.from(image),
	);
}
