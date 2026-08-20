import "@/test-utils/setup-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { downloadFromUrl } from "./download";

const originalClick = window.HTMLAnchorElement.prototype.click;

afterEach(() => {
	window.HTMLAnchorElement.prototype.click = originalClick;
	document.body.replaceChildren();
});

describe("downloadFromUrl", () => {
	test("uses a temporary attachment link without a new browsing context", () => {
		let clicked: HTMLAnchorElement | null = null;
		window.HTMLAnchorElement.prototype.click = function () {
			clicked = this;
		};

		downloadFromUrl(
			"http://localhost:3000/download/book?sig=signed",
			"Book.epub",
		);

		expect(clicked?.href).toBe(
			"http://localhost:3000/download/book?sig=signed",
		);
		expect(clicked?.download).toBe("Book.epub");
		expect(clicked?.target).toBe("");
		expect(document.body.childElementCount).toBe(0);
	});
});
