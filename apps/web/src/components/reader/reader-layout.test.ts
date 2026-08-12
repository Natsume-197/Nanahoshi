import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const readerCss = await Bun.file(
	new URL("./reader.css", import.meta.url),
).text();

describe("continuous reader layout", () => {
	test("generated text wrappers fill the reading area despite EPUB page sizing", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<style>
				.book-content .book-page {
					max-width: 95%;
					margin-right: 5%;
				}
				.book-content .chapter-body {
					box-sizing: border-box;
					width: 95%;
					padding-right: 1em;
				}
			</style>
			<main class="book-content book-content--continuous book-content--writing-horizontal-tb">
				<section>
					<div class="ttu-book-html-wrapper book-page">
						<div class="ttu-book-body-wrapper chapter-body"><p>本文</p></div>
					</div>
				</section>
			</main>
		`);
		const htmlWrapper = dom.window.document.querySelector(
			".ttu-book-html-wrapper",
		) as HTMLElement;
		const bodyWrapper = dom.window.document.querySelector(
			".ttu-book-body-wrapper",
		) as HTMLElement;
		const htmlStyle = dom.window.getComputedStyle(htmlWrapper);
		const bodyStyle = dom.window.getComputedStyle(bodyWrapper);

		expect(htmlStyle.width).toBe("100%");
		expect(htmlStyle.maxWidth).toBe("none");
		expect(htmlStyle.marginRight).toBe("0px");
		expect(bodyStyle.width).toBe("100%");
		expect(bodyStyle.paddingRight).toBe("0px");
	});

	test("justifies CJK text between characters without stretching its final line", () => {
		const dom = new JSDOM(`
			<style>${readerCss}</style>
			<main
				lang="ja"
				class="book-content book-content--continuous book-content--writing-horizontal-tb ttu-apply-justification"
			>
				<p>日本語の本文</p>
			</main>
		`);
		const paragraph = dom.window.document.querySelector("p") as HTMLElement;
		const style = dom.window.getComputedStyle(paragraph);

		expect(style.textAlign).toBe("justify");
		expect(style.textJustify).toBe("inter-character");
		expect(style.textAlignLast).not.toBe("justify");
	});
});
