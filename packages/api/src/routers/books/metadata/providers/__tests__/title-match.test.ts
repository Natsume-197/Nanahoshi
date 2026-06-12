import { describe, expect, test } from "bun:test";
import {
	cleanSearchTerm,
	extractVolumeNumber,
	HAS_VOLUME_PATTERN,
	isTitleSimilar,
	normalizeForComparison,
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
});
