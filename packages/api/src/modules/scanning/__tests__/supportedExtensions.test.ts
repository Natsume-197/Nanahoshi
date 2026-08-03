import { describe, expect, test } from "bun:test";
import {
	EBOOK_EXTENSIONS,
	getEbookMediaType,
	isReaderSupportedEbook,
	isSupportedExtension,
} from "../supportedExtensions";

describe("ebook scan formats", () => {
	test("accepts EPUB and native AZW3 while MOBI remains unsupported", () => {
		expect(EBOOK_EXTENSIONS).toEqual(["epub", "azw3"]);
		expect(isSupportedExtension("book.EPUB", "ebook")).toBe(true);
		expect(isSupportedExtension("book.AZW3", "ebook")).toBe(true);
		expect(isSupportedExtension("book.mobi", "ebook")).toBe(false);
	});

	test("keeps the web reader EPUB-only", () => {
		expect(isReaderSupportedEbook("book.epub")).toBe(true);
		expect(isReaderSupportedEbook("book.azw3")).toBe(false);
	});

	test("assigns the native AZW3 download media type", () => {
		expect(getEbookMediaType("book.epub")).toBe("application/epub+zip");
		expect(getEbookMediaType("book.AZW3")).toBe("application/vnd.amazon.ebook");
	});
});
