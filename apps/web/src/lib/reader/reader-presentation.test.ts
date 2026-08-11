import { describe, expect, test } from "bun:test";
import { resolveReaderPresentation } from "./reader-presentation";
import type { ReaderBookData } from "./types";

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
	storedAt: 0,
} satisfies ReaderBookData;

describe("resolveReaderPresentation", () => {
	test("always selects the dedicated PDF engine", () => {
		const result = resolveReaderPresentation({
			book: pdf,
			preference: { readAs: "text", textLayout: "scroll" },
			defaultTextLayout: "paginated",
			comicLayout: "single-page",
		});

		expect(result.engine).toBe("pdf");
		expect(result.supportsComic).toBe(false);
	});
});
