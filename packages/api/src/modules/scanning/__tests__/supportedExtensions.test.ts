import { describe, expect, test } from "bun:test";
import {
	AZW_MEDIA_TYPE,
	AZW3_MEDIA_TYPE,
	EBOOK_EXTENSIONS,
	ebookMediaTypeForFilename,
	ebookSourceFormatForFilename,
	FB2_MEDIA_TYPE,
	isSupportedExtension,
	isUploadBatchTooLarge,
	MAX_UPLOAD_BATCH_BYTES,
	MAX_UPLOAD_REQUEST_BYTES,
	MOBI_MEDIA_TYPE,
} from "../supportedExtensions";

describe("ebook scan formats", () => {
	test("accepts all implemented ebook extensions case-insensitively", () => {
		expect(EBOOK_EXTENSIONS).toEqual([
			"epub",
			"kepub",
			"kepub.epub",
			"mobi",
			"azw",
			"azw3",
			"fb2",
			"fb2.zip",
			"cbz",
			"cbr",
			"cb7",
			"pdf",
		]);
		expect(isSupportedExtension("book.EPUB", "ebook")).toBe(true);
		expect(isSupportedExtension("book.KEPUB.EPUB", "ebook")).toBe(true);
		expect(isSupportedExtension("book.KEPUB", "ebook")).toBe(true);
		expect(isSupportedExtension("book.AZW", "ebook")).toBe(true);
		expect(isSupportedExtension("book.AZW3", "ebook")).toBe(true);
		expect(isSupportedExtension("book.MOBI", "ebook")).toBe(true);
		expect(isSupportedExtension("book.FB2", "ebook")).toBe(true);
		expect(isSupportedExtension("book.FB2.ZIP", "ebook")).toBe(true);
		expect(isSupportedExtension("book.CBZ", "ebook")).toBe(true);
		expect(isSupportedExtension("book.CBR", "ebook")).toBe(true);
		expect(isSupportedExtension("book.CB7", "ebook")).toBe(true);
		expect(isSupportedExtension("book.PDF", "ebook")).toBe(true);
		expect(isSupportedExtension("book.ZIP", "ebook")).toBe(false);
	});

	test("keeps file, batch and multipart request limits coherent", () => {
		expect(isUploadBatchTooLarge([{ size: MAX_UPLOAD_BATCH_BYTES }])).toBe(
			false,
		);
		expect(
			isUploadBatchTooLarge([{ size: MAX_UPLOAD_BATCH_BYTES }, { size: 1 }]),
		).toBe(true);
		expect(MAX_UPLOAD_REQUEST_BYTES).toBeGreaterThan(MAX_UPLOAD_BATCH_BYTES);
	});

	test("assigns media types and source formats", () => {
		expect(ebookMediaTypeForFilename("book.AZW")).toBe(AZW_MEDIA_TYPE);
		expect(ebookMediaTypeForFilename("book.AZW3")).toBe(AZW3_MEDIA_TYPE);
		expect(ebookMediaTypeForFilename("book.MOBI")).toBe(MOBI_MEDIA_TYPE);
		expect(ebookMediaTypeForFilename("book.FB2.ZIP")).toBe(FB2_MEDIA_TYPE);
		expect(ebookSourceFormatForFilename("book.kepub.epub")).toBe("kepub");
		expect(ebookSourceFormatForFilename("book.azw")).toBe("azw");
		expect(ebookSourceFormatForFilename("book.azw3")).toBe("azw3");
		expect(ebookSourceFormatForFilename("book.mobi")).toBe("mobi");
		expect(ebookSourceFormatForFilename("book.fb2")).toBe("fb2");
		expect(ebookSourceFormatForFilename("book.cbz")).toBe("cbz");
		expect(ebookSourceFormatForFilename("book.cbr")).toBe("cbr");
		expect(ebookSourceFormatForFilename("book.cb7")).toBe("cb7");
		expect(ebookSourceFormatForFilename("book.epub")).toBe("epub");
		expect(ebookSourceFormatForFilename("book.pdf")).toBe("pdf");
		expect(ebookSourceFormatForFilename("book.unknown")).toBeNull();
	});
});
