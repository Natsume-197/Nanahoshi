import "@/test-utils/setup-dom";
import { describe, expect, it } from "bun:test";
import {
	buildAxisPinnedMatchers,
	formatBookDataHtml,
	getHtmlWithImageSource,
} from "../format-book-data-html";
import { buildDummyBookImage } from "../resource-placeholder";
import { sanitizeStoredBookHtml } from "../sanitize-html";
import { BOOK_SANITIZE_VERSION, type ReaderBookData } from "../types";

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

function bookWith(elementHtml: string, blobKeys: string[]): ReaderBookData {
	const blobs: Record<string, Blob> = {};
	for (const key of blobKeys) {
		blobs[key] = new Blob([key], { type: "image/jpeg" });
	}
	return {
		uuid: "u",
		title: "t",
		language: "ja",
		elementHtml,
		styleSheet: "",
		blobs,
		characters: 0,
		sections: [],
		storedAt: 0,
	};
}

describe("getHtmlWithImageSource", () => {
	it("swaps the dummy data URI for the blob's object URL", () => {
		const key = "OEBPS/image/i-1.jpg";
		const { elementHtml, objectUrls } = getHtmlWithImageSource(
			bookWith(`<img src="${buildDummyBookImage(key)}"/>`, [key]),
		);

		expect(objectUrls).toHaveLength(1);
		expect(elementHtml).toBe(`<img src="${objectUrls[0]}"/>`);
	});

	it("swaps the bare ttu: reference form too", () => {
		const key = "OEBPS/image/i-1.jpg";
		const { elementHtml, objectUrls } = getHtmlWithImageSource(
			bookWith(`<image href="ttu:${key}"/>`, [key]),
		);

		expect(elementHtml).toBe(`<image href="${objectUrls[0]}"/>`);
	});

	it("resolves keys containing spaces and semicolons", () => {
		const key = "OEBPS/my image;v2.jpg";
		const { elementHtml, objectUrls } = getHtmlWithImageSource(
			bookWith(`<img src="${buildDummyBookImage(key)}"/>`, [key]),
		);

		expect(elementHtml).toBe(`<img src="${objectUrls[0]}"/>`);
	});

	it("prefers the longest matching key when one prefixes another", () => {
		const short = "img/a.jpg";
		const long = "img/a.jpg.bak";
		const book = bookWith(`<img src="ttu:${long}"/>`, [short, long]);
		const { elementHtml, objectUrls } = getHtmlWithImageSource(book);

		// objectUrls follow Object.entries order: [short, long]
		expect(elementHtml).toBe(`<img src="${objectUrls[1]}"/>`);
	});

	it("replaces every occurrence of a repeated image", () => {
		const key = "img/a.jpg";
		const { elementHtml, objectUrls } = getHtmlWithImageSource(
			bookWith(`<img src="ttu:${key}"/><p>x</p><img src="ttu:${key}"/>`, [key]),
		);

		expect(elementHtml).toBe(
			`<img src="${objectUrls[0]}"/><p>x</p><img src="${objectUrls[0]}"/>`,
		);
	});

	it("leaves references with no packed blob untouched", () => {
		const { elementHtml } = getHtmlWithImageSource(
			bookWith(`<img src="ttu:img/missing.jpg"/>`, ["img/other.jpg"]),
		);

		expect(elementHtml).toBe(`<img src="ttu:img/missing.jpg"/>`);
	});

	it("maps each object URL back to its blob", () => {
		const keys = ["img/a.jpg", "img/b.jpg"];
		const { blobByUrl, objectUrls } = getHtmlWithImageSource(
			bookWith(`<img src="ttu:${keys[0]}"/><img src="ttu:${keys[1]}"/>`, keys),
		);

		expect(blobByUrl.size).toBe(2);
		expect(blobByUrl.get(objectUrls[0])?.size).toBe(keys[0].length);
		expect(blobByUrl.get(objectUrls[1])?.size).toBe(keys[1].length);
	});

	it("resolves packed resources referenced by the stylesheet", () => {
		const key = "azw3/font.woff2";
		const book = bookWith("<p>x</p>", [key]);
		book.styleSheet = `.book-content p{background:url("ttu:${key}")}`;
		const { styleSheet, objectUrls } = getHtmlWithImageSource(book);

		expect(styleSheet).toContain(`url("${objectUrls[0]}")`);
	});

	it("leaves text with no image references identical", () => {
		const html = "<p>ttu is a reader</p><p>data:image/gif is not a ref</p>";
		expect(
			getHtmlWithImageSource(bookWith(html, ["img/a.jpg"])).elementHtml,
		).toBe(html);
	});
});

describe("formatBookDataHtml sanitizing", () => {
	const malicious = `<p onclick="steal()">hi</p><script>steal()</script>`;

	it("sanitizes cache entries that predate write-time sanitizing", async () => {
		const book = bookWith(malicious, []);
		const { elementHtml } = await formatBookDataHtml(book, document, 800);

		expect(elementHtml).not.toContain("<script");
		expect(elementHtml).not.toContain("onclick");
		expect(elementHtml).toContain("hi");
	});

	it("sanitizes entries marked with an older sanitize version", async () => {
		const book = { ...bookWith(malicious, []), sanitizeVersion: 0 };
		const { elementHtml } = await formatBookDataHtml(book, document, 800);

		expect(elementHtml).not.toContain("<script");
		expect(elementHtml).not.toContain("onclick");
	});

	it("trusts entries already cleaned at the current sanitize version", async () => {
		// Written by the ebook adapter, which sanitizes on the way in — re-running
		// DOMPurify here is the cost this flag exists to avoid.
		const book = {
			...bookWith("<p>clean</p>", []),
			sanitizeVersion: BOOK_SANITIZE_VERSION,
		};
		const { elementHtml } = await formatBookDataHtml(book, document, 800);

		expect(elementHtml).toContain("clean");
	});
});

describe("sanitizeStoredBookHtml", () => {
	it("strips scripts and handlers but keeps ttu: image refs", () => {
		const el = document.createElement("div");
		el.innerHTML = `<img src="ttu:img/a.jpg"><p onclick="x()">t</p><script>x()</script>`;

		const html = sanitizeStoredBookHtml(el).innerHTML;

		expect(html).toContain(`src="ttu:img/a.jpg"`);
		expect(html).not.toContain("<script");
		expect(html).not.toContain("onclick");
	});

	it("still blocks javascript: urls", () => {
		const el = document.createElement("div");
		el.innerHTML = `<a href="javascript:x()">t</a>`;

		expect(sanitizeStoredBookHtml(el).innerHTML).not.toContain("javascript:");
	});

	it("keeps the dummy data-uri image form intact", () => {
		const key = "img/a.jpg";
		const el = document.createElement("div");
		el.innerHTML = `<img src="${buildDummyBookImage(key)}">`;

		expect(sanitizeStoredBookHtml(el).innerHTML).toContain(`ttu:${key}`);
	});
});
