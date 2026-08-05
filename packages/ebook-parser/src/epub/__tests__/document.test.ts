import { describe, expect, test } from "bun:test";
import { openEbook } from "../../index";
import { buildZip, bytes } from "../../zip/__tests__/zip-fixture";

const container = `<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`;

const opf = `<?xml version="1.0"?>
<package unique-identifier="uid">
  <metadata>
    <identifier id="uid">urn:uuid:fixture</identifier>
    <identifier scheme="ISBN">978-4-04-073127-8</identifier>
    <title>EPUB fixture</title>
    <creator>Ada</creator>
    <language>en-US</language>
    <publisher>Nanahoshi</publisher>
    <meta property="rendition:layout">reflowable</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="styles" href="styles/main.css" media-type="text/css"/>
    <item id="cover" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine page-progression-direction="rtl"><itemref idref="chapter"/></spine>
</package>`;

const nav = `<html><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml#start">Chapter one</a></li></ol></nav></body></html>`;
const chapter = `<html class="book"><body id="start" class="chapter"><p>Hello EPUB</p><img src="images/cover.jpg"></body></html>`;
const css = `.cover { background-image: url("../images/cover.jpg"); }`;

describe("EPUB EbookDocument", () => {
	test("normalizes metadata, navigation, sections, styles and resources", async () => {
		const cover = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
		const blob = epubFixture(cover);
		const ebook = await openEbook(blob, {
			filename: "fixture.epub",
		});
		if (ebook.content.kind !== "html") throw new Error("Expected HTML content");

		expect(ebook.metadata).toMatchObject({
			identifier: "urn:uuid:fixture",
			title: "EPUB fixture",
			authors: ["Ada"],
			language: "en-US",
			publisher: "Nanahoshi",
		});
		expect(ebook.metadata.presentation).toMatchObject({
			layout: "reflowable",
			pageProgressionDirection: "rtl",
		});
		expect(ebook.content.toc[0]).toMatchObject({
			label: "Chapter one",
			target: { sectionId: "chapter", selector: "#start" },
		});

		const section = await ebook.content.openSection("chapter");
		expect(section).toMatchObject({
			htmlClass: "book",
			bodyClass: "chapter",
			bodyId: "start",
		});
		expect(section?.html).toContain(
			'src="ebook-resource:OEBPS%2Fimages%2Fcover.jpg"',
		);
		expect(section?.styles.join("\n")).toContain(
			"ebook-resource:OEBPS%2Fimages%2Fcover.jpg",
		);
		expect(
			await ebook.content.openResource(
				"ebook-resource:OEBPS%2Fimages%2Fcover.jpg",
			),
		).toEqual({ data: cover, mediaType: "image/jpeg" });
		expect(await ebook.openCover()).toEqual({
			data: cover,
			mediaType: "image/jpeg",
		});
	});

	test("recognizes KEPUB as an EPUB-family document", async () => {
		const ebook = await openEbook(
			epubFixture(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
			{ filename: "fixture.kepub.epub" },
		);
		if (ebook.content.kind !== "html") throw new Error("Expected HTML content");
		expect(ebook.format).toBe("kepub");
		expect(ebook.metadata.title).toBe("EPUB fixture");
		expect(await ebook.content.openSection("chapter")).toBeDefined();
	});

	test("rejects DRM-encrypted KEPUB content explicitly", async () => {
		const encrypted = buildZip([
			{ name: "META-INF/container.xml", data: bytes(container) },
			{
				name: "META-INF/encryption.xml",
				data: bytes(
					`<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>`,
				),
			},
		]);
		await expect(
			openEbook(encrypted, { filename: "encrypted.kepub.epub" }),
		).rejects.toThrow("Encrypted KEPUB files are not supported");
	});
});

function epubFixture(cover: Uint8Array): Blob {
	return buildZip([
		{ name: "META-INF/container.xml", data: bytes(container) },
		{ name: "OEBPS/content.opf", data: bytes(opf) },
		{ name: "OEBPS/nav.xhtml", data: bytes(nav) },
		{ name: "OEBPS/chapter.xhtml", data: bytes(chapter) },
		{ name: "OEBPS/styles/main.css", data: bytes(css) },
		{ name: "OEBPS/images/cover.jpg", data: cover },
	]);
}
