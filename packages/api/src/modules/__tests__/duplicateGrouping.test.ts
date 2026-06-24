import { describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for the false-positive guards in duplicate grouping: ISBN
 * validation (checksum + placeholder rejection) and the Japanese-aware title
 * veto. These are pure functions, but the module pulls in db/queue/repository
 * singletons at import time, so we mock those to keep the test infra-free.
 *
 * Run with:
 *   bun test packages/api/src/modules/__tests__/duplicateGrouping.test.ts
 */

const realSchema = await import("@nanahoshi-v2/db/schema/general");

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/db/schema/general", () => ({ ...realSchema }));
mock.module("../../infrastructure/queue/queues/metadata-enrich.queue", () => ({
	metadataEnrichQueue: { add: mock(async () => {}) },
}));
mock.module("../../infrastructure/search/search-sync.service", () => ({
	enqueueSearchSync: mock(async () => {}),
}));
mock.module("../../routers/books/metadata/metadata.repository", () => ({
	bookMetadataRepository: { isAmazonEnriched: mock(async () => false) },
}));
mock.module("../taskManager", () => ({
	getOrCreateAutoEnrichTask: mock(async () => "task"),
	incrementTotalJobs: mock(async () => {}),
}));
mock.module("../../lib/logger", () => ({
	logger: { error: mock(() => {}), info: mock(() => {}) },
}));

const { isValidIsbn13, isValidIsbn10, normalizeIsbn, titlesCompatible } =
	await import("../duplicateGrouping");

describe("normalizeIsbn", () => {
	test("strips hyphens/spaces and upcases", () => {
		expect(normalizeIsbn("978-0-306-40615-7")).toBe("9780306406157");
		expect(normalizeIsbn(" 030640615x ")).toBe("030640615X");
	});
});

describe("isValidIsbn13", () => {
	test("accepts a valid ISBN-13", () => {
		expect(isValidIsbn13("9780306406157")).toBe(true);
		expect(isValidIsbn13("978-0-306-40615-7")).toBe(true);
	});

	test("rejects a wrong checksum", () => {
		expect(isValidIsbn13("9780306406158")).toBe(false);
	});

	test("rejects wrong length / non-digits", () => {
		expect(isValidIsbn13("978030640615")).toBe(false);
		expect(isValidIsbn13("97803064061XY")).toBe(false);
	});

	test("rejects placeholders (all-same digit)", () => {
		expect(isValidIsbn13("0000000000000")).toBe(false);
		expect(isValidIsbn13("9999999999999")).toBe(false);
	});
});

describe("isValidIsbn10", () => {
	test("accepts a valid ISBN-10 (incl. X check digit)", () => {
		expect(isValidIsbn10("0306406152")).toBe(true);
		expect(isValidIsbn10("0-306-40615-2")).toBe(true);
		expect(isValidIsbn10("097522980X")).toBe(true);
	});

	test("rejects a wrong checksum", () => {
		expect(isValidIsbn10("0306406153")).toBe(false);
	});

	test("rejects placeholders", () => {
		expect(isValidIsbn10("0000000000")).toBe(false);
	});
});

describe("titlesCompatible (Japanese-aware veto)", () => {
	const t = (title: string | null, titleRomaji: string | null = null) => ({
		title,
		titleRomaji,
	});

	test("identical Japanese titles are compatible", () => {
		const jp = "時々ボソッとロシア語でデレる隣のアーリャさん";
		expect(titlesCompatible(t(jp), t(jp))).toBe(true);
	});

	test("full-width vs half-width digits fold via NFKC", () => {
		expect(
			titlesCompatible(t("ロシア語でデレる２"), t("ロシア語でデレる2")),
		).toBe(true);
	});

	test("subtitle suffix is treated as a prefix match", () => {
		expect(
			titlesCompatible(t("Sword Art Online"), t("Sword Art Online: Aincrad")),
		).toBe(true);
	});

	test("clearly different titles are NOT compatible (blocks false merge)", () => {
		expect(
			titlesCompatible(
				t("時々ボソッとロシア語でデレる隣のアーリャさん"),
				t("この素晴らしい世界に祝福を！"),
			),
		).toBe(false);
	});

	test("falls back to romaji when kanji titles differ in script", () => {
		expect(
			titlesCompatible(
				t(null, "Tokidoki Bosotto Roshiago"),
				t(null, "Tokidoki Bosotto Roshiago"),
			),
		).toBe(true);
	});

	test("missing titles on both sides are not compatible (conservative)", () => {
		expect(titlesCompatible(t(null, null), t(null, null))).toBe(false);
	});
});
