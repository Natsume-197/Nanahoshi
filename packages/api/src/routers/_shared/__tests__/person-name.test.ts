import { describe, expect, test } from "bun:test";
import { normalizePersonName } from "../person-name";

describe("normalizePersonName", () => {
	test("Japanese names: spacing variants collapse to one identity", () => {
		expect(normalizePersonName("入間 人間")).toBe("入間人間");
		expect(normalizePersonName("入間　人間")).toBe("入間人間"); // ideographic space
		expect(normalizePersonName("入間人間")).toBe("入間人間");
	});

	test("Japanese names: kana-only and mixed-script pen names", () => {
		expect(normalizePersonName("わかつき ひかる")).toBe("わかつきひかる");
		expect(normalizePersonName("Ａちき")).toBe("aちき");
		expect(normalizePersonName("Aちき")).toBe("aちき");
	});

	test("Japanese names: separator dots and equals are not identity", () => {
		expect(normalizePersonName("Ｇ・ウザク")).toBe("gウザク");
		expect(normalizePersonName("G・ウザク")).toBe("gウザク");
		expect(normalizePersonName("アーサー・C・クラーク")).toBe(
			"アーサーcクラーク",
		);
		expect(normalizePersonName("アーサー＝クラーク")).toBe("アーサークラーク");
	});

	test("fullwidth Latin folds via NFKC even without kana/kanji", () => {
		expect(normalizePersonName("ａｂｅｃ")).toBe("abec");
		expect(normalizePersonName("ＨｏｎｅｙＷｏｒｋｓ")).toBe("HoneyWorks");
	});

	test("Latin names stay near-verbatim: case, dots and single spaces kept", () => {
		expect(normalizePersonName("J. K. Rowling")).toBe("J. K. Rowling");
		expect(normalizePersonName("J.K. Rowling")).toBe("J.K. Rowling");
		expect(normalizePersonName("Abbé Prévost")).toBe("Abbé Prévost");
	});

	test("Latin names: trim and collapse of whitespace runs only", () => {
		expect(normalizePersonName("  Aaron   Bernstein ")).toBe("Aaron Bernstein");
	});

	test("kanji names with Latin honorifics still count as Japanese", () => {
		expect(normalizePersonName("J.R.R. トールキン")).toBe("j.r.r.トールキン");
		expect(normalizePersonName("J. R. R. トールキン")).toBe("j.r.r.トールキン");
	});
});
