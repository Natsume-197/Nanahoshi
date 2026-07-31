import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";

const realSchema = await import("@nanahoshi-v2/db/schema/general");

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/db/schema/general", () => ({ ...realSchema }));
mock.module("../../infrastructure/queue/queues/metadata-enrich.queue", () => ({
	metadataEnrichQueue: { add: mock(async () => {}) },
}));
const { bookMetadataRepository } = await import(
	"../../routers/books/metadata/metadata.repository"
);
const isAmazonEnrichedSpy = spyOn(
	bookMetadataRepository,
	"isAmazonEnriched",
).mockImplementation(async () => false);
afterAll(() => isAmazonEnrichedSpy.mockRestore());

const loggerMock = {
	error: mock(() => {}),
	info: mock(() => {}),
	warn: mock(() => {}),
	debug: mock(() => {}),
	child: mock(() => loggerMock),
};
mock.module("../../lib/logger", () => ({ logger: loggerMock }));

const {
	isValidIsbn13,
	isValidIsbn10,
	isValidAsin,
	normalizeIsbn,
	normalizeAsin,
} = await import("../duplicateGrouping");
const { isUsableEmbeddedUid } = await import("../identifiers");

describe("duplicate identifier validation", () => {
	test("normalizes ISBN and ASIN values", () => {
		expect(normalizeIsbn("978-0-306-40615-7")).toBe("9780306406157");
		expect(normalizeIsbn(" 030640615x ")).toBe("030640615X");
		expect(normalizeAsin(" b07nrcpyw6 ")).toBe("B07NRCPYW6");
	});

	test("validates ISBN-13 checksums and rejects placeholders", () => {
		expect(isValidIsbn13("9780306406157")).toBe(true);
		expect(isValidIsbn13("9780306406158")).toBe(false);
		expect(isValidIsbn13("978030640615")).toBe(false);
		expect(isValidIsbn13("0000000000000")).toBe(false);
	});

	test("validates ISBN-10 checksums, including X", () => {
		expect(isValidIsbn10("0306406152")).toBe(true);
		expect(isValidIsbn10("097522980X")).toBe(true);
		expect(isValidIsbn10("0306406153")).toBe(false);
		expect(isValidIsbn10("0000000000")).toBe(false);
	});

	test("accepts Kindle ASINs but not ISBN-shaped or malformed values", () => {
		expect(isValidAsin("B07NRCPYW6")).toBe(true);
		expect(isValidAsin("0306406152")).toBe(false);
		expect(isValidAsin("B07NRCPYW")).toBe(false);
		expect(isValidAsin("")).toBe(false);
	});

	test("accepts stable embedded ids and rejects copy-local or typed ids", () => {
		expect(isUsableEmbeddedUid("3299511152")).toBe(true);
		expect(isUsableEmbeddedUid("BW-000123456")).toBe(true);
		expect(
			isUsableEmbeddedUid("urn:uuid:72e82680-431e-4f89-877e-1f86fabc8d78"),
		).toBe(false);
		expect(isUsableEmbeddedUid("calibre:238")).toBe(false);
		expect(isUsableEmbeddedUid("0000000000")).toBe(false);
		expect(isUsableEmbeddedUid("B08R8G4XMQ")).toBe(false);
		expect(isUsableEmbeddedUid("9784040731278")).toBe(false);
	});
});

describe("regroupBookDuplicates via embedded uid", () => {
	test("groups a qualified uid but rejects it above the boilerplate cap", async () => {
		const { bookRepository } = await import(
			"../../routers/books/book.repository"
		);
		const { regroupBookDuplicates } = await import("../duplicateGrouping");
		const target = bookRepository as unknown as Record<string, unknown>;
		const methods = {
			getGroupingInfo: mock(async () => ({
				libraryId: 1,
				groupLocked: false,
				title: "LoveR 1",
				titleRomaji: null,
				isbn13: null,
				isbn10: null,
				asin: null,
				embeddedUid: "3299511152",
			})),
			countBooksWithEmbeddedUid: mock(async () => uidCount),
			findGroupingCandidates: mock(async () => [
				{
					id: 10,
					filesizeKb: 900,
					duplicateOfBookId: null,
					title: "LoveR 1",
					titleRomaji: null,
				},
				{
					id: 20,
					filesizeKb: 500,
					duplicateOfBookId: null,
					title: "LoveR　1",
					titleRomaji: null,
				},
			]),
			clearDuplicatePointerIfSet: mock(async () => {}),
			clearDuplicatePointers: mock(async () => {}),
			setDuplicateOf: mock(async () => {}),
		};
		let uidCount = 2;
		const originals = Object.entries(methods).map(([key, value]) => {
			const previous = target[key];
			target[key] = value;
			return [key, previous] as const;
		});

		try {
			await regroupBookDuplicates(10);
			expect(methods.setDuplicateOf).toHaveBeenCalledWith([20], 10);

			methods.setDuplicateOf.mockClear();
			uidCount = 50;
			await regroupBookDuplicates(10);
			expect(methods.setDuplicateOf).not.toHaveBeenCalled();
			expect(methods.clearDuplicatePointerIfSet).toHaveBeenCalledWith(10);
		} finally {
			for (const [key, value] of originals) target[key] = value;
		}
	});
});
