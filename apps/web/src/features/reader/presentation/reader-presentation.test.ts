import { describe, expect, test } from "bun:test";
import type { ReaderBookData } from "@/features/reader/document/types";
import {
	canUsePageColumns,
	loadReaderPresentationPreference,
	resolveReaderPresentation,
	saveReaderPresentationPreference,
} from "./reader-presentation";

const pdf = {
	uuid: "pdf",
	sourceFormat: "pdf",
	contentForm: "images",
	title: "PDF",
	language: "en",
	elementHtml: "",
	styleSheet: "",
	blobs: {},
	characters: 2,
	sections: [],
} satisfies ReaderBookData;

const epub = {
	...pdf,
	uuid: "epub",
	sourceFormat: "epub",
	contentForm: "text",
	title: "EPUB",
} satisfies ReaderBookData;

const imageBook = {
	...epub,
	uuid: "image-book",
	contentForm: "images",
	title: "Image-first EPUB",
} satisfies ReaderBookData;

describe("resolveReaderPresentation", () => {
	test("keeps legacy comic preferences while writing the broader visual name", () => {
		const values = new Map<string, string>();
		const originalWindow = globalThis.window;
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			writable: true,
			value: {
				localStorage: {
					getItem: (key: string) => values.get(key) ?? null,
					setItem: (key: string, value: string) => values.set(key, value),
					removeItem: (key: string) => values.delete(key),
				},
			},
		});

		try {
			values.set(
				"nanahoshi-reader-mode-preferences",
				JSON.stringify({ book: { readAs: "comic" } }),
			);

			expect(loadReaderPresentationPreference("book")).toEqual({
				readAs: "visual",
			});
			saveReaderPresentationPreference("book", { readAs: "visual" });
			expect(values.get("nanahoshi-reader-mode-preferences")).toBe(
				JSON.stringify({ book: { readAs: "visual" } }),
			);
		} finally {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				writable: true,
				value: originalWindow,
			});
		}
	});

	test("drops legacy per-book layouts and uses the profile layout", () => {
		const values = new Map<string, string>();
		const originalWindow = globalThis.window;
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			writable: true,
			value: {
				localStorage: {
					getItem: (key: string) => values.get(key) ?? null,
					setItem: (key: string, value: string) => values.set(key, value),
					removeItem: (key: string) => values.delete(key),
				},
			},
		});

		try {
			values.set(
				"nanahoshi-reader-mode-preferences",
				JSON.stringify({ book: { readAs: "text", textLayout: "focus" } }),
			);

			const preference = loadReaderPresentationPreference("book");
			expect(preference).toEqual({ readAs: "text" });
			const result = resolveReaderPresentation({
				book: epub,
				preference,
				defaultTextLayout: "paginated",
				visualLayout: "single-page",
			});
			expect(result.textLayout).toBe("paginated");
			expect(result.renderer).toBe("text-paginated");
		} finally {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				writable: true,
				value: originalWindow,
			});
		}
	});

	test("only enables the columns control for horizontal paginated text", () => {
		expect(canUsePageColumns("text-paginated", false)).toBe(true);
		expect(canUsePageColumns("text-paginated", true)).toBe(false);
		expect(canUsePageColumns("text-scroll", false)).toBe(false);
		expect(canUsePageColumns("text-focus", false)).toBe(false);
	});

	test("keeps PDFs as fixed-page content in their dedicated renderer", () => {
		const result = resolveReaderPresentation({
			book: pdf,
			preference: { readAs: "text" },
			defaultTextLayout: "paginated",
			visualLayout: "single-page",
		});

		expect(result.contentKind).toBe("pdf");
		expect(result.renderer).toBe("pdf");
		expect(result.supportsVisual).toBe(false);
	});

	test("selects the sentence-focused renderer for text content", () => {
		const result = resolveReaderPresentation({
			book: epub,
			preference: { readAs: "text" },
			defaultTextLayout: "focus",
			visualLayout: "single-page",
		});

		expect(result.contentKind).toBe("text");
		expect(result.renderer).toBe("text-focus");
		expect(result.textLayout).toBe("focus");
	});

	test("routes image-first books to the visual renderer in automatic mode", () => {
		const result = resolveReaderPresentation({
			book: imageBook,
			preference: { readAs: "auto" },
			defaultTextLayout: "scroll",
			visualLayout: "single-page",
		});

		expect(result.resolvedAs).toBe("visual");
		expect(result.contentKind).toBe("visual");
		expect(result.renderer).toBe("visual");
		expect(result.supportsVisual).toBe(true);
	});
});
