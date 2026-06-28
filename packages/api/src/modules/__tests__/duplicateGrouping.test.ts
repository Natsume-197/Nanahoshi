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
	titlesCompatible,
} = await import("../duplicateGrouping");

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

describe("normalizeAsin", () => {
	test("trims and upcases", () => {
		expect(normalizeAsin(" b07nrcpyw6 ")).toBe("B07NRCPYW6");
	});
});

describe("isValidAsin", () => {
	test("accepts Kindle ASINs (B + 9 alphanumerics)", () => {
		expect(isValidAsin("B07NRCPYW6")).toBe(true);
		expect(isValidAsin(" b08gfh5glx ")).toBe(true);
	});

	test("rejects ISBN-10-shaped ASINs (covered by the ISBN path)", () => {
		expect(isValidAsin("0306406152")).toBe(false);
		expect(isValidAsin("097522980X")).toBe(false);
	});

	test("rejects wrong length / shape", () => {
		expect(isValidAsin("B07NRCPYW")).toBe(false);
		expect(isValidAsin("B07NRCPYW67")).toBe(false);
		expect(isValidAsin("")).toBe(false);
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

	// A bad Amazon ASIN can be shared across a whole series. These guard the veto
	// against folding genuinely different volumes/editions behind one canonical.
	test("kanji-subtitle volumes are NOT compatible (Haruhi, shared ASIN)", () => {
		// boilerplate (series label + imprint) must not swamp the distinguishing kanji
		const label = "「涼宮ハルヒ」シリーズ (角川スニーカー文庫)";
		expect(
			titlesCompatible(
				t(`涼宮ハルヒの憤慨 ${label}`),
				t(`涼宮ハルヒの憂鬱 ${label}`),
			),
		).toBe(false);
	});

	test("前/後 part markers separate two parts of one volume", () => {
		const label = "「涼宮ハルヒ」シリーズ (角川スニーカー文庫)";
		expect(
			titlesCompatible(
				t(`涼宮ハルヒの驚愕（前） ${label}`),
				t(`涼宮ハルヒの驚愕（後） ${label}`),
			),
		).toBe(false);
	});

	test("上/下 trailing part markers separate movie halves", () => {
		expect(
			titlesCompatible(
				t("劇場版 STEINS;GATE　負荷領域のデジャヴ 上"),
				t("劇場版 STEINS;GATE　負荷領域のデジャヴ 下"),
			),
		).toBe(false);
	});

	test("前編/後編 markers separate novel parts", () => {
		expect(
			titlesCompatible(
				t("STEINS;GATE 4　六分儀のイディオム：前編"),
				t("STEINS;GATE 5　六分儀のイディオム：後編"),
			),
		).toBe(false);
	});

	test("a kanji marker INSIDE a word is not a part marker (境界面上の…)", () => {
		// 上 here is part of 境界面上; different subtitles already separate these,
		// but the veto must not crash/misfire by reading 上 as a part marker.
		expect(
			titlesCompatible(
				t("STEINS;GATE 3　境界面上のシュタインズ・ゲート：Rebirth"),
				t("STEINS;GATE 3　境界面上のシュタインズ・ゲート：Rebirth"),
			),
		).toBe(true);
	});

	test("differing trailing volume numbers are NOT compatible", () => {
		expect(
			titlesCompatible(
				t("私の推しは悪役令嬢。4"),
				t("私の推しは悪役令嬢。5【Kindle限定特典あり】 (GL文庫)"),
			),
		).toBe(false);
	});

	test("same volume, different imprint/bonus suffix IS compatible", () => {
		expect(
			titlesCompatible(
				t("私の推しは悪役令嬢。4"),
				t("私の推しは悪役令嬢。4 (GL文庫)"),
			),
		).toBe(true);
	});

	test("unnumbered vol 1 copies (bonus suffix only) stay compatible", () => {
		expect(
			titlesCompatible(
				t("私の推しは悪役令嬢。"),
				t("私の推しは悪役令嬢。【Kindle限定特典あり】 (GL文庫)"),
			),
		).toBe(true);
	});

	test("a spin-off (SS short stories) is NOT a copy of the main volume", () => {
		// shared ASIN + prefix-match would otherwise fold these together
		expect(titlesCompatible(t("安達としまむら"), t("安達としまむらSS"))).toBe(
			false,
		);
	});

	test("two copies of the same SS volume stay compatible", () => {
		expect(titlesCompatible(t("安達としまむらSS"), t("安達としまむらSS"))).toBe(
			true,
		);
	});

	test("'SS' inside a latin word is not a spin-off marker", () => {
		// PSYCHO-PASS contains 'ss' but must not trip the supplement veto
		expect(titlesCompatible(t("PSYCHO-PASS"), t("PSYCHO-PASS"))).toBe(true);
	});
});
