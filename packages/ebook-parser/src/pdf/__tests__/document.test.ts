import { describe, expect, test } from "bun:test";
import { ebookFormatFromFilename } from "../../formats";
import { openEbook } from "../../index";
import { buildPdfFixture } from "./pdf-fixture";

describe("PDF EbookDocument", () => {
	test("reads document metadata and exposes stable pages", async () => {
		const ebook = await openEbook(buildPdfFixture(), {
			filename: "fixture.pdf",
		});

		expect(ebook.format).toBe("pdf");
		expect(ebook.metadata).toMatchObject({
			title: "Fixture PDF",
			authors: ["Ada Lovelace", "Grace Hopper"],
			description: "Parser fixture",
			subjects: ["testing", "pdf"],
			published: "2026-08-10",
			presentation: {
				layout: "pre-paginated",
				pageProgressionDirection: "ltr",
			},
		});
		expect(ebook.metadata.identifier).toMatch(/^pdf-sha256-[0-9a-f]{48}$/);
		if (ebook.content.kind !== "pages") throw new Error("Expected pages");
		expect(ebook.content.pages).toEqual([{ id: "page-1", label: "Page 1" }]);
		expect(await ebook.content.sampleText?.()).toEqual({
			textLength: 9,
			sampledPages: 1,
		});
		await ebook.close();
	});

	test("detects the PDF extension case-insensitively", () => {
		expect(ebookFormatFromFilename("book.PDF")).toBe("pdf");
	});
});
