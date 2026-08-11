import { describe, expect, test } from "bun:test";
import { createPdfReaderConfig } from "./pdf-reader-config";

const source = { url: "https://reader.example/odyssey.pdf", name: "Odyssey" };

describe("PDF reader configuration", () => {
	test("preloads enough neighboring pages for continuous scrolling", () => {
		const config = createPdfReaderConfig({
			wasmUrl: "/assets/pdfium.wasm",
			baseUrl: "https://reader.example/books/odyssey",
			source,
		});
		const scrollPlugin = config.plugins.find(
			(registration) => registration.package.manifest.id === "scroll",
		);

		expect(scrollPlugin?.config).toMatchObject({ defaultBufferSize: 4 });
	});

	test("requests the range-capable reader transport", () => {
		const config = createPdfReaderConfig({
			wasmUrl: "/assets/pdfium.wasm",
			baseUrl: "https://reader.example/books/odyssey",
			source,
		});
		const documentManager = config.plugins.find(
			(registration) => registration.package.manifest.id === "document-manager",
		);

		expect(documentManager?.config.initialDocuments?.[0]).toMatchObject({
			mode: "range-request",
			requestOptions: { credentials: "include" },
		});
	});

	test("gives blob workers an absolute WASM URL", () => {
		expect(
			createPdfReaderConfig({
				wasmUrl: "/assets/pdfium.wasm",
				baseUrl: "https://reader.example/books/odyssey",
				source,
			}).engine,
		).toMatchObject({
			wasmUrl: "https://reader.example/assets/pdfium.wasm",
			worker: true,
		});
	});

	test("preserves an already absolute WASM URL", () => {
		expect(
			createPdfReaderConfig({
				wasmUrl: "https://cdn.example/pdfium.wasm",
				baseUrl: "https://reader.example/books/odyssey",
				source,
			}).engine.wasmUrl,
		).toBe("https://cdn.example/pdfium.wasm");
	});
});
