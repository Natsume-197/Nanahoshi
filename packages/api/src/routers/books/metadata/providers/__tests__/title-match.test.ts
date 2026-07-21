import { describe, expect, test } from "bun:test";
import {
	cleanSearchTerm,
	extractPartMarker,
	extractVolumeNumber,
	HAS_VOLUME_PATTERN,
	haveMatchingAuthor,
	isAuthorSimilar,
	isAutomaticTitleMatch,
	isTitleSimilar,
	normalizeForComparison,
	partMarkersConflict,
	stripImprintParens,
	stripSeriesTagline,
	titleSimilarityScore,
} from "../title-match";

describe("normalizeForComparison", () => {
	test("converts full-width digits to ASCII", () => {
		expect(normalizeForComparison("タイトル４")).toBe("タイトル4");
	});

	test("strips punctuation and lowercases", () => {
		expect(normalizeForComparison("Title (Vol.1)")).toBe("titlevol1");
	});
});

describe("isTitleSimilar", () => {
	test("matches containment", () => {
		expect(isTitleSimilar("本好きの下剋上", "本好きの下剋上第一部")).toBe(true);
	});

	test("rejects mismatched volume numbers", () => {
		expect(
			isTitleSimilar(
				normalizeForComparison("ソード・オラトリア3"),
				normalizeForComparison("ソード・オラトリア15巻"),
			),
		).toBe(false);
	});

	test("CJK bigram similarity rejects unrelated titles", () => {
		expect(
			isTitleSimilar(
				normalizeForComparison("ようこそ実力至上主義の教室へ"),
				normalizeForComparison("ありふれた職業で世界最強"),
			),
		).toBe(false);
	});
});

describe("isAutomaticTitleMatch", () => {
	test("rejects a short containment when authors conflict", () => {
		expect(
			isAutomaticTitleMatch({
				inputTitle: "斜陽",
				candidateTitle: "斜陽の国のルスダン",
				inputAuthors: ["太宰治"],
				candidateAuthors: ["並木陽"],
			}),
		).toBe(false);
	});

	test("rejects an exact ambiguous title when authors conflict", () => {
		expect(
			isAutomaticTitleMatch({
				inputTitle: "オセロ",
				candidateTitle: "オセロ",
				inputAuthors: ["藤原チコ"],
				candidateAuthors: ["別の著者"],
			}),
		).toBe(false);
	});

	test("accepts tolerant title matching when the author corroborates it", () => {
		expect(
			isAutomaticTitleMatch({
				inputTitle: "本好きの下剋上",
				candidateTitle: "本好きの下剋上 第一部",
				inputAuthors: ["香月 美夜"],
				candidateAuthors: ["香月美夜", "Miya Kazuki"],
			}),
		).toBe(true);
	});

	test("keeps distinctive containment without author metadata", () => {
		expect(
			isAutomaticTitleMatch({
				inputTitle: "本好きの下剋上",
				candidateTitle: "本好きの下剋上第一部",
			}),
		).toBe(true);
	});

	test("requires author evidence for an uncorroborated short title", () => {
		expect(
			isAutomaticTitleMatch({
				inputTitle: "斜陽",
				candidateTitle: "斜陽",
			}),
		).toBe(false);
	});
});

describe("stripImprintParens", () => {
	test("drops a 文庫 imprint label", () => {
		expect(stripImprintParens("タイトル (電撃文庫)").trim()).toBe("タイトル");
	});

	test("drops a ブックス/ラノベ imprint label", () => {
		expect(
			stripImprintParens(
				"本好きの下剋上ふぁんぶっく8 (TOブックスラノベ)",
			).trim(),
		).toBe("本好きの下剋上ふぁんぶっく8");
	});

	test("keeps a non-imprint parenthetical", () => {
		expect(stripImprintParens("タイトル (前編)")).toBe("タイトル (前編)");
	});

	test("lets a fanbook match despite imprint + missing tagline", () => {
		// The input carries the series tagline, Amazon's listing carries the
		// imprint instead — without stripping it the bigram ratio falls below
		// the 0.6 threshold and the real fanbook is dropped.
		const input = normalizeForComparison(
			stripImprintParens(
				"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく８",
			),
		);
		const result = normalizeForComparison(
			stripImprintParens("本好きの下剋上ふぁんぶっく8 (TOブックスラノベ)"),
		);
		expect(isTitleSimilar(input, result)).toBe(true);
	});
});

describe("stripSeriesTagline", () => {
	test("drops a wavy-dash series tagline (U+301C)", () => {
		expect(
			stripSeriesTagline(
				"本好きの下剋上 〜司書になるためには手段を選んでいられません〜 ふぁんぶっく10",
			),
		).toBe("本好きの下剋上 ふぁんぶっく10");
	});

	test("drops a full-width-tilde tagline (U+FF5E)", () => {
		expect(
			stripSeriesTagline(
				"本好きの下剋上～司書になるためには手段を選んでいられません～ 短編集",
			),
		).toBe("本好きの下剋上 短編集");
	});

	test("keeps a short paired marker (〜上〜 is not a tagline)", () => {
		expect(stripSeriesTagline("タイトル〜上〜")).toBe("タイトル〜上〜");
	});

	test("leaves a title with no paired wavy dashes untouched", () => {
		expect(
			stripSeriesTagline("青春ブタ野郎はバニーガール先輩の夢を見ない"),
		).toBe("青春ブタ野郎はバニーガール先輩の夢を見ない");
	});
});

describe("titleSimilarityScore", () => {
	test("containment scores 1", () => {
		expect(titleSimilarityScore("本好きの下剋上", "本好きの下剋上第一部")).toBe(
			1,
		);
	});

	test("ranks the matching series sibling above a same-length wrong one", () => {
		// 青春ブタ野郎は<…>の夢を見ない: same skeleton, different subtitle. The
		// volume that shares the subtitle must score strictly higher, so ranking
		// by score (not length) picks プチデビル後輩 over ハツコイ少女.
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
	});

	test("returns 0 for empty input", () => {
		expect(titleSimilarityScore("", "anything")).toBe(0);
	});
});

describe("HAS_VOLUME_PATTERN", () => {
	test("detects digits, kanji markers and roman numerals", () => {
		expect(HAS_VOLUME_PATTERN.test("タイトル 3")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("タイトル ４")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("本好きの下剋上 第三部")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("Title II")).toBe(true);
		expect(HAS_VOLUME_PATTERN.test("ただのタイトル")).toBe(false);
	});
});

describe("extractVolumeNumber", () => {
	test("extracts trailing Arabic digits", () => {
		expect(extractVolumeNumber("ソード・オラトリア15")).toBe(15);
	});

	test("extracts full-width digits", () => {
		expect(extractVolumeNumber("よりみち４回目")).toBe(4);
	});

	test("extracts kanji volume markers", () => {
		expect(extractVolumeNumber("本好きの下剋上 第三部")).toBe(3);
		expect(extractVolumeNumber("第十二巻")).toBe(12);
	});

	test("uses the last number in the title", () => {
		expect(extractVolumeNumber("86-エイティシックス- 5")).toBe(5);
	});

	test("returns null when no volume", () => {
		expect(extractVolumeNumber("ただのタイトル")).toBeNull();
	});
});

describe("cleanSearchTerm", () => {
	test("removes brackets and dashes", () => {
		expect(cleanSearchTerm("喰 -kuu- 【特装版】")).toBe("喰 kuu 特装版");
	});

	test("drops a long angle-bracketed cross-reference (series anchor)", () => {
		expect(
			cleanSearchTerm(
				"青春ブタ野郎はプチデビル後輩の夢を見ない<青春ブタ野郎はバニーガール先輩の夢を見ない> (電撃文庫)",
			),
		).toBe("青春ブタ野郎はプチデビル後輩の夢を見ない 電撃文庫");
	});

	test("keeps a short angle-bracketed part marker", () => {
		expect(cleanSearchTerm("タイトル〈上〉")).toBe("タイトル 上");
	});
});

describe("extractPartMarker", () => {
	test("reads 前編/後編 and 上巻/下巻", () => {
		expect(extractPartMarker("STEINS;GATE 4　六分儀のイディオム：前編")).toBe(
			"前",
		);
		expect(extractPartMarker("…後編")).toBe("後");
		expect(extractPartMarker("本好きの下剋上 上巻")).toBe("上");
	});

	test("reads （前）（後） parens", () => {
		expect(extractPartMarker("涼宮ハルヒの驚愕（前）")).toBe("前");
		expect(extractPartMarker("涼宮ハルヒの驚愕（後）")).toBe("後");
	});

	test("reads a delimited standalone marker before a bracket or at the end", () => {
		expect(
			extractPartMarker(
				"劇場版 STEINS;GATE　負荷領域のデジャヴ 上 (角川スニーカー文庫)",
			),
		).toBe("上");
		expect(extractPartMarker("劇場版 STEINS;GATE　負荷領域のデジャヴ 下")).toBe(
			"下",
		);
	});

	test("ignores a kanji that is part of a word (境界面上の…)", () => {
		expect(
			extractPartMarker(
				"STEINS;GATE 3　境界面上のシュタインズ・ゲート：Rebirth",
			),
		).toBeNull();
	});
});

describe("partMarkersConflict", () => {
	test("movie 上 conflicts with novel 前編 (the false-link bug)", () => {
		expect(
			partMarkersConflict(
				"劇場版 STEINS;GATE　負荷領域のデジャヴ 上",
				"STEINS;GATE 4　六分儀のイディオム：前編",
			),
		).toBe(true);
	});

	test("same marker (上 vs 上) does not conflict", () => {
		expect(
			partMarkersConflict(
				"…負荷領域のデジャヴ 上",
				"劇場版…デジャヴ 上 (文庫)",
			),
		).toBe(false);
	});

	test("no conflict when a side lacks a marker", () => {
		expect(
			partMarkersConflict("私の推しは悪役令嬢。4", "私の推しは悪役令嬢。"),
		).toBe(false);
	});
});

describe("isAuthorSimilar", () => {
	test("matches surname against full name", () => {
		expect(isAuthorSimilar(["J. R. R. Tolkien"], "Tolkien")).toBe(true);
		expect(isAuthorSimilar(["Patrick Rothfuss"], "Rothfuss")).toBe(true);
	});

	test("matches spaced vs unspaced CJK names", () => {
		expect(isAuthorSimilar(["川原礫"], "川原 礫")).toBe(true);
		expect(isAuthorSimilar(["川原 礫"], "川原礫")).toBe(true);
		expect(isAuthorSimilar(["渡 航"], "渡航")).toBe(true);
	});

	test("tolerates minor spelling variations", () => {
		expect(isAuthorSimilar(["Patrick Rothfuss"], "Patrik Rothfus")).toBe(true);
	});

	test("rejects unrelated authors", () => {
		expect(isAuthorSimilar(["Stephen King"], "Brandon Sanderson")).toBe(false);
		expect(isAuthorSimilar(["有川浩"], "西尾維新")).toBe(false);
	});

	test("empty query always matches", () => {
		expect(isAuthorSimilar(["Someone"], "")).toBe(true);
	});

	test("matches when any author from each side is compatible", () => {
		expect(
			haveMatchingAuthor(["香月 美夜", "別名"], ["香月美夜", "Miya Kazuki"]),
		).toBe(true);
		expect(haveMatchingAuthor(["太宰治"], ["並木陽"])).toBe(false);
	});
});
