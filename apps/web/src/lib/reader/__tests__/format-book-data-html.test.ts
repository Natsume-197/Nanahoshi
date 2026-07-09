import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";
import { buildAxisPinnedMatchers } from "../format-book-data-html";

function imgInBookContent(className: string) {
	const container = document.createElement("div");
	container.className = "book-content";
	const img = document.createElement("img");
	img.className = className;
	container.appendChild(img);
	return img;
}

describe("buildAxisPinnedMatchers", () => {
	it("matches images whose class pins the height", () => {
		const { pinsHeight, pinsWidth } = buildAxisPinnedMatchers(
			".book-content .full-page{height:100%;}.book-content .wide{width:100%;}",
			document,
		);
		expect(pinsHeight(imgInBookContent("full-page"))).toBe(true);
		expect(pinsHeight(imgInBookContent("wide"))).toBe(false);
		expect(pinsWidth(imgInBookContent("wide"))).toBe(true);
		expect(pinsWidth(imgInBookContent("full-page"))).toBe(false);
	});

	it("matches min-width / min-height rules too", () => {
		const { pinsHeight, pinsWidth } = buildAxisPinnedMatchers(
			".book-content .tall{min-height:50vh;}.book-content .broad{min-width:10em;}",
			document,
		);
		expect(pinsHeight(imgInBookContent("tall"))).toBe(true);
		expect(pinsWidth(imgInBookContent("broad"))).toBe(true);
	});

	it("ignores auto values", () => {
		const { pinsHeight, pinsWidth } = buildAxisPinnedMatchers(
			".book-content .free{height:auto;width:auto;}",
			document,
		);
		expect(pinsHeight(imgInBookContent("free"))).toBe(false);
		expect(pinsWidth(imgInBookContent("free"))).toBe(false);
	});

	it("ignores unrelated properties containing the axis name", () => {
		const { pinsHeight, pinsWidth } = buildAxisPinnedMatchers(
			".book-content .roomy{line-height:2;max-height:100%;max-width:100%;border-width:1px;}",
			document,
		);
		expect(pinsHeight(imgInBookContent("roomy"))).toBe(false);
		expect(pinsWidth(imgInBookContent("roomy"))).toBe(false);
	});

	it("drops invalid selectors without breaking the valid ones", () => {
		const { pinsHeight } = buildAxisPinnedMatchers(
			".book-content ::-broken-pseudo{height:1em;}.book-content .full-page{height:100%;}",
			document,
		);
		expect(pinsHeight(imgInBookContent("full-page"))).toBe(true);
	});

	it("matches nothing when no rule pins an axis", () => {
		const { pinsHeight, pinsWidth } = buildAxisPinnedMatchers(
			".book-content p{margin:0;}",
			document,
		);
		expect(pinsHeight(imgInBookContent("full-page"))).toBe(false);
		expect(pinsWidth(imgInBookContent("full-page"))).toBe(false);
	});
});
