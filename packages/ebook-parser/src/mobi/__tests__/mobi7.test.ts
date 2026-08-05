import { describe, expect, test } from "bun:test";
import { openEbook } from "../../index";
import { decompressPalmDoc } from "../binary";
import { openMobi } from "../index";

describe("PalmDOC", () => {
	test("decompresses literals, space-prefixed characters and back-references", () => {
		// Literal "abc", a 3-byte copy, then compact " a".
		const compressed = Uint8Array.of(3, 97, 98, 99, 0x80, 0x18, 0xe1);
		expect(new TextDecoder().decode(decompressPalmDoc(compressed))).toBe(
			"abcabc a",
		);
	});
});

describe("openMobi", () => {
	test("adapts MOBI to the common EbookDocument interface", async () => {
		const ebook = await openEbook(buildMobi7Fixture(), {
			filename: "fixture.mobi",
		});
		if (ebook.content.kind !== "html") throw new Error("Expected HTML content");
		expect(ebook.content.kind).toBe("html");
		expect(ebook.metadata.title).toBe("Fixture title");
		expect(ebook.content.toc[0]?.target?.sectionId).toBe("0");
		const first = await ebook.content.openSection("0");
		expect(first?.html).toContain('href="ebook-section:0"');
		expect(first?.html).toContain('src="ebook-resource:embed:1"');
		expect(
			await ebook.content.openResource("ebook-resource:embed:1"),
		).toMatchObject({ mediaType: "image/jpeg" });
	});

	test("opens unencrypted AZW through the MOBI7 parser", async () => {
		const ebook = await openEbook(buildMobi7Fixture(), {
			filename: "fixture.azw",
		});
		if (ebook.content.kind !== "html") throw new Error("Expected HTML content");
		expect(ebook.format).toBe("azw");
		expect(ebook.metadata.title).toBe("Fixture title");
		expect(await ebook.content.openSection("0")).toBeDefined();
	});

	test("opens MOBI7 metadata, sections, links, TOC, cover and resources", () => {
		const ebook = openMobi(buildMobi7Fixture());
		expect(ebook.format).toBe("mobi");
		expect(ebook.metadata).toMatchObject({
			title: "Fixture title",
			authors: ["Ada & Bob"],
			language: "en-US",
			asin: "B012345678",
		});
		expect(ebook.sections).toHaveLength(2);
		const first = ebook.loadSection("0");
		expect(first?.html).toContain('href="filepos:80"');
		expect(first?.html).toContain('src="ebook-resource:embed:1"');
		expect(ebook.toc[0]).toEqual({
			label: "Chapter one",
			href: "filepos:80",
			children: [{ label: "Nested chapter", href: "filepos:140" }],
		});
		expect(ebook.resolveHref("filepos:80")?.id).toBe("0");
		expect(ebook.loadResource("ebook-resource:embed:1")).toMatchObject({
			mediaType: "image/jpeg",
		});
		expect(ebook.getCover()?.mediaType).toBe("image/jpeg");
	});

	test("rejects encrypted ebooks explicitly", () => {
		const fixture = buildMobi7Fixture();
		const firstRecord = pdbRecordOffset(fixture, 0);
		writeUint(fixture, firstRecord + 12, 2, 1);
		expect(() => openMobi(fixture)).toThrow(
			"Encrypted MOBI/AZW files are not supported",
		);
	});
});

function buildMobi7Fixture(): Uint8Array {
	const text = new TextEncoder().encode(
		'<html><head><reference type="toc" filepos="0"/></head><body>' +
			'<p><a filepos="80">Chapter one</a></p>' +
			'<blockquote><p><a filepos="140">Nested chapter</a></p></blockquote>' +
			'<img recindex="1">' +
			"<mbp:pagebreak><p>Second section</p></body></html>",
	);
	const first = new Uint8Array(400);
	writeUint(first, 0, 2, 1); // no compression
	writeUint(first, 8, 2, 1); // one text record
	writeUint(first, 10, 2, 4096);
	writeAscii(first, 16, "MOBI");
	writeUint(first, 20, 4, 232);
	writeUint(first, 24, 4, 2);
	writeUint(first, 28, 4, 65001);
	writeUint(first, 32, 4, 12345);
	writeUint(first, 36, 4, 6);
	writeUint(first, 84, 4, 380);
	writeUint(first, 88, 4, 13);
	writeUint(first, 94, 1, 4); // en-US region slot
	writeUint(first, 95, 1, 9); // English
	writeUint(first, 108, 4, 2); // resource record begins after text
	writeUint(first, 128, 4, 0x40); // EXTH present
	writeUint(first, 240, 4, 0);
	writeUint(first, 244, 4, 0xffff_ffff);

	const exth = makeExth([
		[100, new TextEncoder().encode("Ada &amp; Bob")],
		[113, new TextEncoder().encode("B012345678")],
		[201, uintBytes(0, 4)],
		[503, new TextEncoder().encode("Fixture title")],
		[524, new TextEncoder().encode("en-US")],
	]);
	first.set(exth, 248);
	writeAscii(first, 380, "Fallback title");

	const cover = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4);
	return makePalmDatabase([first, text, cover]);
}

function makePalmDatabase(records: Uint8Array[]): Uint8Array {
	const headerLength = 78 + records.length * 8 + 2;
	const total =
		headerLength + records.reduce((sum, record) => sum + record.length, 0);
	const output = new Uint8Array(total);
	writeAscii(output, 0, "Nanahoshi fixture");
	writeAscii(output, 60, "BOOK");
	writeAscii(output, 64, "MOBI");
	writeUint(output, 76, 2, records.length);
	let offset = headerLength;
	for (let index = 0; index < records.length; index++) {
		writeUint(output, 78 + index * 8, 4, offset);
		output.set(records[index] ?? new Uint8Array(), offset);
		offset += records[index]?.length ?? 0;
	}
	return output;
}

function makeExth(records: [number, Uint8Array][]): Uint8Array {
	const length =
		12 + records.reduce((sum, [, data]) => sum + 8 + data.length, 0);
	const output = new Uint8Array(length);
	writeAscii(output, 0, "EXTH");
	writeUint(output, 4, 4, length);
	writeUint(output, 8, 4, records.length);
	let offset = 12;
	for (const [type, data] of records) {
		writeUint(output, offset, 4, type);
		writeUint(output, offset + 4, 4, data.length + 8);
		output.set(data, offset + 8);
		offset += data.length + 8;
	}
	return output;
}

function pdbRecordOffset(bytes: Uint8Array, index: number): number {
	return new DataView(
		bytes.buffer,
		bytes.byteOffset + 78 + index * 8,
		4,
	).getUint32(0);
}

function uintBytes(value: number, length: number): Uint8Array {
	const output = new Uint8Array(length);
	writeUint(output, 0, length, value);
	return output;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
	bytes.set(new TextEncoder().encode(value), offset);
}

function writeUint(
	bytes: Uint8Array,
	offset: number,
	length: number,
	value: number,
) {
	const view = new DataView(bytes.buffer, bytes.byteOffset + offset, length);
	if (length === 4) view.setUint32(0, value);
	else if (length === 2) view.setUint16(0, value);
	else view.setUint8(0, value);
}
