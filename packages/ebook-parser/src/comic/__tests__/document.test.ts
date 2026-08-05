import { describe, expect, test } from "bun:test";
import { ebookFormatFromFilename } from "../../formats";
import { openEbook } from "../../index";
import { buildZip, bytes } from "../../zip/__tests__/zip-fixture";

const comicInfo = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo>
  <Title>Native comic</Title>
  <Series>Parser Adventures</Series>
  <Number>2</Number>
  <Summary>A comic fixture.</Summary>
  <Writer>Ada; Grace</Writer>
  <Penciller>Ada</Penciller>
  <Colorist>Lin</Colorist>
  <Publisher>Nanahoshi</Publisher>
  <Genre>Adventure, Testing</Genre>
  <LanguageISO>en-US</LanguageISO>
  <Year>2026</Year><Month>8</Month><Day>4</Day>
  <Pages><Page Image="1" Type="FrontCover" /></Pages>
</ComicInfo>`;

describe("comic EbookDocument", () => {
	test("opens CBZ pages in natural order and reads ComicInfo.xml", async () => {
		const page1 = Uint8Array.of(1);
		const page2 = Uint8Array.of(2);
		const page10 = Uint8Array.of(10);
		const ebook = await openEbook(
			buildZip([
				{ name: "pages/page10.jpg", data: page10 },
				{ name: "pages/page2.png", data: page2, deflate: true },
				{ name: "pages/page1.webp", data: page1 },
				{ name: "__MACOSX/._page0.jpg", data: Uint8Array.of(0) },
				{ name: "notes.txt", data: bytes("not a page") },
				{ name: "ComicInfo.xml", data: bytes(comicInfo), deflate: true },
			]),
			{ filename: "fixture.cbz" },
		);

		expect(ebook.format).toBe("cbz");
		expect(ebook.metadata).toMatchObject({
			title: "Native comic",
			authors: ["Ada", "Grace"],
			contributors: ["Lin"],
			publisher: "Nanahoshi",
			language: "en-US",
			published: "2026-08-04",
			subjects: ["Adventure", "Testing"],
		});
		if (ebook.content.kind !== "pages") throw new Error("Expected pages");
		expect(ebook.content.pages).toEqual([
			{ id: "pages/page1.webp", label: "Page 1" },
			{ id: "pages/page2.png", label: "Page 2" },
			{ id: "pages/page10.jpg", label: "Page 3" },
		]);
		expect(await ebook.content.openPage("pages/page10.jpg")).toEqual({
			data: page10,
			mediaType: "image/jpeg",
		});
		expect(await ebook.openCover()).toEqual({
			data: page2,
			mediaType: "image/png",
		});
		await ebook.close();
	});

	test("detects every comic archive extension case-insensitively", () => {
		expect(ebookFormatFromFilename("comic.CBZ")).toBe("cbz");
		expect(ebookFormatFromFilename("comic.CBR")).toBe("cbr");
		expect(ebookFormatFromFilename("comic.CB7")).toBe("cb7");
	});
});
