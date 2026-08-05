import { describe, expect, test } from "bun:test";
import { openEbook } from "../../index";
import { buildZip, bytes } from "../../zip/__tests__/zip-fixture";

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>science_fiction</genre>
      <author><first-name>Ada</first-name><last-name>Lovelace</last-name></author>
      <book-title>FB2 &amp; fixture</book-title>
      <annotation><p>A structured description.</p></annotation>
      <keywords>testing; parser</keywords>
      <date value="2026-08-04">4 August 2026</date>
      <coverpage><image l:href="#cover.jpg"/></coverpage>
      <lang>en</lang>
      <translator><nickname>Translator</nickname></translator>
    </title-info>
    <document-info><id>fb2-fixture-id</id></document-info>
    <publish-info><publisher>Nanahoshi</publisher><isbn>9781234567897</isbn></publish-info>
  </description>
  <body>
    <title><p>Body title</p></title>
    <section id="chapter-one">
      <title><p>Chapter one</p></title>
      <p>Hello <strong>FB2</strong>. <image l:href="#cover.jpg"/> <a l:href="#note-one">Read note</a>.</p>
      <section id="note-one"><title><p>Notes</p></title><p>Nested note.</p></section>
    </section>
  </body>
  <binary id="cover.jpg" content-type="image/jpeg">/9j/2Q==</binary>
</FictionBook>`;

describe("FB2 EbookDocument", () => {
	test("normalizes metadata, structure, links and embedded images", async () => {
		const ebook = await openEbook(bytes(fixture), { filename: "fixture.fb2" });
		if (ebook.content.kind !== "html") throw new Error("Expected HTML content");

		expect(ebook.format).toBe("fb2");
		expect(ebook.metadata).toMatchObject({
			identifier: "fb2-fixture-id",
			title: "FB2 & fixture",
			authors: ["Ada Lovelace"],
			publisher: "Nanahoshi",
			language: "en",
			published: "2026-08-04",
			contributors: ["Translator"],
		});
		expect(ebook.metadata.identifiers).toEqual([
			{ value: "fb2-fixture-id", scheme: "FB2" },
			{ value: "9781234567897", scheme: "ISBN" },
		]);
		expect(ebook.metadata.subjects).toEqual([
			"science_fiction",
			"testing",
			"parser",
		]);
		expect(ebook.content.sections).toEqual([{ id: "chapter-one" }]);
		expect(ebook.content.toc[0]).toMatchObject({
			label: "Chapter one",
			target: { sectionId: "chapter-one" },
			children: [
				{
					label: "Notes",
					target: { sectionId: "chapter-one", selector: "#note-one" },
				},
			],
		});

		const section = await ebook.content.openSection("chapter-one");
		expect(section?.html).toContain("<strong>FB2</strong>");
		expect(section?.html).toContain('src="ebook-resource:cover.jpg"');
		expect(section?.html).toContain(
			'href="ebook-section:chapter-one#note-one"',
		);
		expect(section?.styles[0]).toContain(".fb2-title");
		expect(
			await ebook.content.openResource("ebook-resource:cover.jpg"),
		).toEqual({
			data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
			mediaType: "image/jpeg",
		});
		expect(await ebook.openCover()).toEqual({
			data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
			mediaType: "image/jpeg",
		});
	});

	test("opens FB2 distributed inside a ZIP", async () => {
		const ebook = await openEbook(
			buildZip([
				{ name: "nested/fixture.fb2", data: bytes(fixture), deflate: true },
			]),
			{ filename: "fixture.fb2.zip" },
		);
		expect(ebook.format).toBe("fb2");
		expect(ebook.metadata.title).toBe("FB2 & fixture");
	});

	test("honors legacy XML encodings used by FB2 libraries", async () => {
		const prefix = bytes(`<?xml version="1.0" encoding="windows-1251"?>
<FictionBook><description><title-info><book-title>`);
		const title = new Uint8Array([0xd2, 0xe5, 0xf1, 0xf2]); // Тест
		const suffix = bytes(
			"</book-title></title-info></description><body><section><p>Text</p></section></body></FictionBook>",
		);
		const encoded = new Uint8Array(
			prefix.length + title.length + suffix.length,
		);
		encoded.set(prefix);
		encoded.set(title, prefix.length);
		encoded.set(suffix, prefix.length + title.length);

		const ebook = await openEbook(encoded, { filename: "legacy.fb2" });
		expect(ebook.metadata.title).toBe("Тест");
	});
});
