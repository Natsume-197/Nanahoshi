import { describe, expect, test } from "bun:test";
import { EBOOK_EXTENSIONS, isSupportedExtension } from "../supportedExtensions";

describe("ebook scan formats", () => {
	test("accepts EPUB and rejects legacy AZW3 conversion inputs", () => {
		expect(EBOOK_EXTENSIONS).toEqual(["epub"]);
		expect(isSupportedExtension("book.EPUB", "ebook")).toBe(true);
		expect(isSupportedExtension("book.azw3", "ebook")).toBe(false);
	});
});
