import { describe, expect, test } from "bun:test";
import { openMobi } from "../index";

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4);
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const RESC = ascii("RESCpadding");
const FDST = ascii("FDSTpadding");
const WEBP = Uint8Array.of(
	0x52,
	0x49,
	0x46,
	0x46,
	0x10,
	0,
	0,
	0,
	0x57,
	0x45,
	0x42,
	0x50,
);

describe("MOBI cover resolution", () => {
	test("uses EXTH 201 when present", () => {
		const ebook = openMobi(
			buildFixture({ exth: [[201, uintBytes(0)]], resources: [JPEG, RESC] }),
		);
		expect(ebook.getCover()?.mediaType).toBe("image/jpeg");
	});

	test("falls back to EXTH 202 when 201 is unset", () => {
		const ebook = openMobi(
			buildFixture({
				exth: [
					[201, uintBytes(0xffff_ffff)],
					[202, uintBytes(1)],
				],
				resources: [RESC, PNG],
			}),
		);
		expect(ebook.getCover()?.mediaType).toBe("image/png");
	});

	// The regression this whole change exists for: KF8 books that carry only 129.
	test("resolves the KF8 cover from EXTH 129 when 201/202 are absent", () => {
		const ebook = openMobi(
			buildFixture({
				exth: [[129, ascii("kindle:embed:0002")]],
				resources: [RESC, JPEG],
			}),
		);
		expect(ebook.getCover()?.mediaType).toBe("image/jpeg");
	});

	test("decodes the EXTH 129 index as base 32", () => {
		// "000v" = 31 in base 32 -> zero-based index 30.
		const resources = Array.from({ length: 32 }, () => RESC);
		resources[30] = PNG;
		const ebook = openMobi(
			buildFixture({ exth: [[129, ascii("kindle:embed:000v")]], resources }),
		);
		expect(ebook.getCover()?.mediaType).toBe("image/png");
	});

	// The index is off across the MOBI7/KF8 boundary in real files, so a declared
	// cover that lands on a structural record still has to find the art.
	test("scans for the first image when the declared index is not one", () => {
		const ebook = openMobi(
			buildFixture({
				exth: [[129, ascii("kindle:embed:0001")]],
				resources: [RESC, FDST, JPEG],
			}),
		);
		expect(ebook.getCover()?.mediaType).toBe("image/jpeg");
	});

	test("scans when the declared index is past the end of the file", () => {
		const ebook = openMobi(
			buildFixture({ exth: [[201, uintBytes(99)]], resources: [RESC, PNG] }),
		);
		expect(ebook.getCover()?.mediaType).toBe("image/png");
	});

	test("accepts a WebP cover instead of reading it as audio", () => {
		const ebook = openMobi(
			buildFixture({
				exth: [[129, ascii("kindle:embed:0001")]],
				resources: [WEBP],
			}),
		);
		expect(ebook.getCover()?.mediaType).toBe("image/webp");
	});

	// Never invent a cover: a book with no cover tag must stay coverless even
	// when its resource section opens with an illustration.
	test("returns nothing when the book declares no cover at all", () => {
		const ebook = openMobi(buildFixture({ exth: [], resources: [JPEG, PNG] }));
		expect(ebook.getCover()).toBeUndefined();
	});

	test("returns nothing when a declared cover has no image anywhere", () => {
		const ebook = openMobi(
			buildFixture({
				exth: [[129, ascii("kindle:embed:0001")]],
				resources: [RESC, FDST],
			}),
		);
		expect(ebook.getCover()).toBeUndefined();
	});

	test("does not wander past the scan limit into interior illustrations", () => {
		const resources = Array.from({ length: 12 }, () => RESC);
		resources[10] = JPEG;
		const ebook = openMobi(
			buildFixture({ exth: [[201, uintBytes(0xffff_fffe)]], resources }),
		);
		expect(ebook.getCover()).toBeUndefined();
	});
});

function buildFixture(opts: {
	exth: [number, Uint8Array][];
	resources: Uint8Array[];
}): Uint8Array {
	const text = ascii("<html><body><p>Fixture</p></body></html>");
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
	writeUint(first, 94, 1, 4);
	writeUint(first, 95, 1, 9);
	writeUint(first, 108, 4, 2); // resources begin after header + text
	writeUint(first, 128, 4, 0x40); // EXTH present
	writeUint(first, 240, 4, 0);
	writeUint(first, 244, 4, 0xffff_ffff);

	first.set(makeExth([[503, ascii("Fixture title")], ...opts.exth]), 248);
	writeAscii(first, 380, "Fallback title");

	return makePalmDatabase([first, text, ...opts.resources]);
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

function ascii(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

function uintBytes(value: number): Uint8Array {
	const output = new Uint8Array(4);
	writeUint(output, 0, 4, value);
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
