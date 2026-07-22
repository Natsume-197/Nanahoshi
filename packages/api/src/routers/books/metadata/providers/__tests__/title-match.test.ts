import { describe, expect, test } from "bun:test";
import {
	cleanSearchTerm,
	extractTrailingVolume,
	extractVolumeNumber,
	HAS_VOLUME_PATTERN,
	haveMatchingAuthor,
	isAuthorSimilar,
	isTitleSimilar,
	normalizeForComparison,
	stripImprintParens,
	stripSeriesTagline,
	titleSimilarityScore,
} from "../title-match";

describe("provider title ranking", () => {
	test("normalizes width, punctuation and case", () => {
		expect(normalizeForComparison("タイトル４")).toBe("タイトル4");
		expect(normalizeForComparison("Title (Vol.1)")).toBe("titlevol1");
		expect(normalizeForComparison("兵士の娘Ⅱ")).toBe("兵士の娘ii");
	});

	test("uses containment and CJK bigrams without crossing volumes", () => {
		expect(isTitleSimilar("本好きの下剋上", "本好きの下剋上第一部")).toBe(true);
		expect(
			isTitleSimilar(
				normalizeForComparison("ソード・オラトリア3"),
				normalizeForComparison("ソード・オラトリア15巻"),
			),
		).toBe(false);
		expect(
			isTitleSimilar(
				normalizeForComparison("ようこそ実力至上主義の教室へ"),
				normalizeForComparison("ありふれた職業で世界最強"),
			),
		).toBe(false);
	});

	test("scores the matching series sibling above a similar wrong one", () => {
		const input = normalizeForComparison(
			"青春ブタ野郎はプチデビル後輩の夢を見ない 電撃文庫",
		);
		const right = titleSimilarityScore(
			input,
			normalizeForComparison(
				"青春ブタ野郎はプチデビル後輩の夢を見ない 『青春ブタ野郎』シリーズ 電撃文庫",
			),
		);
		const wrong = titleSimilarityScore(
			input,
			normalizeForComparison("青春ブタ野郎はハツコイ少女の夢を見ない"),
		);
		expect(right).toBeGreaterThan(wrong);
		expect(titleSimilarityScore("", "anything")).toBe(0);
	});
});

describe("provider query cleanup", () => {
	test("strips imprint packaging only for comparison", () => {
		expect(stripImprintParens("タイトル (電撃文庫)").trim()).toBe("タイトル");
		expect(
			stripImprintParens(
				"本好きの下剋上ふぁんぶっく8 (TOブックスラノベ)",
			).trim(),
		).toBe("本好きの下剋上ふぁんぶっく8");
		expect(stripImprintParens("タイトル (前編)")).toBe("タイトル (前編)");
	});

	test("strips long series taglines but preserves short part markers", () => {
		expect(
			stripSeriesTagline(
				"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく10",
			),
		).toBe("本好きの下剋上 ふぁんぶっく10");
		expect(stripSeriesTagline("タイトル〜上〜")).toBe("タイトル〜上〜");
	});

	test("cleans decorations while preserving useful search terms", () => {
		expect(cleanSearchTerm("喰 -kuu- 【特装版】")).toBe("喰 kuu 特装版");
		expect(
			cleanSearchTerm(
				"青春ブタ野郎はプチデビル後輩の夢を見ない<青春ブタ野郎はバニーガール先輩の夢を見ない> (電撃文庫)",
			),
		).toBe("青春ブタ野郎はプチデビル後輩の夢を見ない 電撃文庫");
		expect(cleanSearchTerm("タイトル〈上〉")).toBe("タイトル 上");
	});
});

describe("provider volume ranking", () => {
	test("detects numeric, kanji and Roman volume markers", () => {
		expect(HAS_VOLUME_PATTERN.test("タイトル 3")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("タイトル ４")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("本好きの下剋上 第三部")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("Title II")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("兵士の娘Ⅱ")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("ただのタイトル")).toBe(false);
	});

	test("extracts Arabic, kanji and Roman volume numbers", () => {
		expect(extractVolumeNumber("ソード・オラトリア15")).toBe(15);
		expect(extractVolumeNumber("よりみち４回目")).toBe(4);
		expect(extractVolumeNumber("本好きの下剋上 第三部")).toBe(3);
		expect(extractVolumeNumber("第十二巻")).toBe(12);
		expect(extractVolumeNumber("86-エイティシックス- 5")).toBe(5);
		expect(extractVolumeNumber("兵士の娘Ⅱ")).toBe(2);
		expect(extractTrailingVolume("兵士の娘Ⅲ」")).toBe(3);
		expect(extractVolumeNumber("ただのタイトル")).toBeNull();
	});
});

describe("fuzzy author ranking", () => {
	test("matches surnames, spaced CJK names and minor spelling differences", () => {
		expect(isAuthorSimilar(["J. R. R. Tolkien"], "Tolkien")).toBe(true);
		expect(isAuthorSimilar(["川原 礫"], "川原礫")).toBe(true);
		expect(isAuthorSimilar(["Patrick Rothfuss"], "Patrik Rothfus")).toBe(true);
	});

	test("rejects unrelated authors and accepts any compatible alias", () => {
		expect(isAuthorSimilar(["Stephen King"], "Brandon Sanderson")).toBe(false);
		expect(
			haveMatchingAuthor(["香月 美夜", "別名"], ["香月美夜", "Miya Kazuki"]),
		).toBe(true);
		expect(haveMatchingAuthor(["太宰治"], ["並木陽"])).toBe(false);
	});
});
