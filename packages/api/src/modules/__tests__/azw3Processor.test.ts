import { describe, expect, test } from "bun:test";
import { parseAzw3 } from "../azw3Processor";

function u32(value: number): Buffer {
	const out = Buffer.alloc(4);
	out.writeUInt32BE(value);
	return out;
}

function exth(type: number, value: string | number): Buffer {
	const payload = typeof value === "number" ? u32(value) : Buffer.from(value);
	return Buffer.concat([u32(type), u32(payload.length + 8), payload]);
}

/** A generated PalmDB/KF8 container with a tiny PNG signature as its cover. */
function minimalAzw3(
	options: { version?: number; includeLanguageExth?: boolean } = {},
): Buffer {
	const records = [
		exth(100, "Ada Lovelace"),
		exth(100, "Charles Babbage"),
		exth(101, "Analytical Press"),
		exth(103, "A generated fixture, not a published book."),
		exth(104, "9780306406157"),
		exth(105, "Computing; History"),
		exth(106, "2026-07-14"),
		exth(112, "calibre:fixture-uid"),
		exth(113, "B012345678"),
		exth(201, 0),
		exth(503, "The Analytical Engine"),
		...(options.includeLanguageExth === false ? [] : [exth(524, "en-US")]),
	];
	const exthBody = Buffer.concat(records);
	const exthHeader = Buffer.concat([
		Buffer.from("EXTH"),
		u32(exthBody.length + 12),
		u32(records.length),
		exthBody,
	]);
	const mobiLength = 232;
	const title = Buffer.from("Fallback title");
	const record0 = Buffer.alloc(16 + mobiLength);
	record0.writeUInt16BE(1, 0); // uncompressed PalmDOC
	Buffer.from("MOBI").copy(record0, 16);
	record0.writeUInt32BE(mobiLength, 20);
	record0.writeUInt32BE(2, 24);
	record0.writeUInt32BE(65001, 28);
	record0.writeUInt32BE(options.version ?? 8, 36);
	record0.writeUInt32BE(9, 92); // MOBI language id: English
	record0.writeUInt32BE(1, 108); // first image record
	record0.writeUInt32BE(0x40, 128); // EXTH present
	const titleOffset = record0.length + exthHeader.length;
	record0.writeUInt32BE(titleOffset, 84);
	record0.writeUInt32BE(title.length, 88);
	const metadataRecord = Buffer.concat([record0, exthHeader, title]);
	const cover = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
	]);
	const embeddedOpf = Buffer.from(
		'<package><metadata><meta name="calibre:series" content="Engine Papers"/><meta name="calibre:series_index" content="2.5"/></metadata></package>',
	);

	const pdbHeader = Buffer.alloc(78 + 3 * 8);
	Buffer.from("Generated AZW3 fixture").copy(pdbHeader, 0);
	Buffer.from("BOOKMOBI").copy(pdbHeader, 60);
	pdbHeader.writeUInt16BE(3, 76);
	const firstOffset = pdbHeader.length;
	pdbHeader.writeUInt32BE(firstOffset, 78);
	pdbHeader.writeUInt32BE(firstOffset + metadataRecord.length, 86);
	pdbHeader.writeUInt32BE(
		firstOffset + metadataRecord.length + cover.length,
		94,
	);
	return Buffer.concat([pdbHeader, metadataRecord, cover, embeddedOpf]);
}

describe("parseAzw3", () => {
	test("extracts native KF8 metadata, identifiers, subjects, series, and cover", () => {
		const result = parseAzw3(minimalAzw3());

		expect(result.metadata).toEqual({
			title: "The Analytical Engine",
			authors: ["Ada Lovelace", "Charles Babbage"],
			publisher: "Analytical Press",
			description: "A generated fixture, not a published book.",
			publishedDate: "2026-07-14",
			languageCode: "en-US",
			isbn10: null,
			isbn13: "9780306406157",
			asin: "B012345678",
			embeddedUid: "fixture-uid",
			subjects: ["Computing", "History"],
			series: { name: "Engine Papers", position: 2.5 },
		});
		expect(result.cover?.extension).toBe(".png");
		expect(result.cover?.bytes.subarray(0, 8)).toEqual(
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		);
		expect(result.rawExth[100]).toEqual(["Ada Lovelace", "Charles Babbage"]);
	});

	test("rejects a legacy MOBI container even when renamed to .azw3", () => {
		expect(() => parseAzw3(minimalAzw3({ version: 6 }))).toThrow(
			"not a native AZW3/KF8 file",
		);
	});

	test("falls back to the MOBI header language when EXTH omits it", () => {
		const result = parseAzw3(minimalAzw3({ includeLanguageExth: false }));
		expect(result.metadata.languageCode).toBe("en");
	});
});
