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

	test("uses the official pan state machine with pointer as the default", () => {
		const config = createPdfReaderConfig({
			wasmUrl: "/assets/pdfium.wasm",
			baseUrl: "https://reader.example/books/odyssey",
			source,
		});
		const panPlugin = config.plugins.find(
			(registration) => registration.package.manifest.id === "pan",
		);

		expect(panPlugin?.config).toMatchObject({ defaultMode: "never" });
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

	test("registers the reader-only document capabilities", () => {
		const config = createPdfReaderConfig({
			wasmUrl: "/assets/pdfium.wasm",
			baseUrl: "https://reader.example/books/odyssey",
			source,
		});
		const pluginIds = config.plugins.map(
			(registration) => registration.package.manifest.id,
		);

		expect(pluginIds).toEqual(
			expect.arrayContaining([
				"thumbnail",
				"print",
				"export",
				"history",
				"annotation",
				"form",
			]),
		);
		const exportPlugin = config.plugins.find(
			(registration) => registration.package.manifest.id === "export",
		);
		expect(exportPlugin?.config).toMatchObject({
			defaultFileName: source.name,
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
