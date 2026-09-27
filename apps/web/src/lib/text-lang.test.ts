import { describe, expect, test } from "bun:test";
import { detectTextLang, typesetProps } from "./text-lang";

describe("detectTextLang", () => {
	test("tags kana, kanji and half-width katakana as Japanese", () => {
		expect(detectTextLang("やはり俺の青春ラブコメはまちがっている。")).toBe(
			"ja",
		);
		expect(detectTextLang("狩人の悪夢")).toBe("ja");
		expect(detectTextLang("ﾌﾗｲ")).toBe("ja");
		expect(detectTextLang("弱キャラ友崎くん Lv.1")).toBe("ja");
	});

	test("leaves Latin text and non-strings untagged", () => {
		expect(detectTextLang("The Name of the Wind")).toBeUndefined();
		expect(detectTextLang("")).toBeUndefined();
		expect(detectTextLang(undefined)).toBeUndefined();
		expect(detectTextLang(42)).toBeUndefined();
	});
});

describe("typesetProps", () => {
	test("marks Japanese text with lang and its typeset role", () => {
		expect(typesetProps("狩人の悪夢")).toEqual({
			lang: "ja",
			"data-typeset": "text",
		});
		expect(typesetProps("弱キャラ友崎くん", "display")).toEqual({
			lang: "ja",
			"data-typeset": "display",
		});
	});

	test("adds nothing for Latin text or non-string children", () => {
		expect(typesetProps("Dune")).toEqual({});
		expect(typesetProps(null, "display")).toEqual({});
	});
});
