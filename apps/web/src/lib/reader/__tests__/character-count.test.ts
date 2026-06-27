import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";
import {
	getCharacterCount,
	isElementGaiji,
	isNodeGaiji,
} from "../character-count";

function textNode(text: string) {
	return document.createTextNode(text);
}

function img(className = ""): HTMLImageElement {
	const el = document.createElement("img");
	if (className) el.className = className;
	return el;
}

describe("getCharacterCount", () => {
	it("counts Japanese code points in a text node", () => {
		// 5 kana
		expect(getCharacterCount(textNode("ねこである"))).toBe(5);
	});

	it("strips whitespace and foreign punctuation, keeps the Japanese", () => {
		// ideographic period 。, newline and full-width space are stripped
		expect(getCharacterCount(textNode("猫だ。\n　"))).toBe(2);
	});

	it("keeps alphanumerics (the count set is broader than kana/kanji)", () => {
		// digits and latin letters are in the keep-set, spaces are not
		expect(getCharacterCount(textNode("ab 12"))).toBe(4);
	});

	it("counts a surrogate-pair kanji as one", () => {
		expect(getCharacterCount(textNode("𠮟"))).toBe(1);
	});

	it("counts a gaiji <img> as 1", () => {
		expect(getCharacterCount(img("gaiji"))).toBe(1);
		expect(getCharacterCount(img("foo gaiji-char bar"))).toBe(1);
	});

	it("counts a non-gaiji <img> as 0", () => {
		expect(getCharacterCount(img("illustration"))).toBe(0);
		expect(getCharacterCount(img())).toBe(0);
	});

	it("returns 0 for empty / whitespace-only text", () => {
		expect(getCharacterCount(textNode("   \n\t"))).toBe(0);
	});
});

describe("isElementGaiji / isNodeGaiji", () => {
	it("is true only when a class contains 'gaiji'", () => {
		expect(isElementGaiji(img("gaiji"))).toBe(true);
		expect(isElementGaiji(img("x gaiji y"))).toBe(true);
		expect(isElementGaiji(img("illustration"))).toBe(false);
	});

	it("isNodeGaiji is false for non-image nodes", () => {
		expect(isNodeGaiji(textNode("猫"))).toBe(false);
		expect(isNodeGaiji(img("gaiji"))).toBe(true);
		expect(isNodeGaiji(img("plain"))).toBe(false);
	});
});
