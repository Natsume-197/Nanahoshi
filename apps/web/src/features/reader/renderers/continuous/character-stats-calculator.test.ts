import { beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { CharacterStatsCalculator } from "./character-stats-calculator";

let dom: JSDOM;

beforeAll(() => {
	dom = new JSDOM(
		"<!doctype html><html><body><main id='book'>A, Б.中</main></body></html>",
	);
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		Node: dom.window.Node,
		Element: dom.window.Element,
		HTMLElement: dom.window.HTMLElement,
		HTMLImageElement: dom.window.HTMLImageElement,
		getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
	});
	Object.defineProperty(dom.window.Range.prototype, "getBoundingClientRect", {
		configurable: true,
		value(this: Range) {
			return {
				top: this.startOffset * 10,
				bottom: this.startOffset * 10 + 10,
				left: 0,
				right: 1,
				width: 1,
				height: 10,
				x: 0,
				y: this.startOffset * 10,
				toJSON: () => ({}),
			};
		},
	});
});

describe("precise reader positions", () => {
	test("reads and restores an offset inside a mixed-script text node", () => {
		const book = dom.window.document.getElementById("book") as HTMLElement;
		const text = book.firstChild as Text;
		Object.defineProperty(dom.window.document, "caretPositionFromPoint", {
			configurable: true,
			value: () => ({ offsetNode: text, offset: 5 }),
		});
		const calculator = new CharacterStatsCalculator(
			book,
			"horizontal",
			"ltr",
			dom.window.document.documentElement,
			dom.window.document,
		);

		expect(calculator.calcPreciseExploredCharCount()).toBe(2);
		expect(calculator.getScrollPosForCharCount(2, 0)).toBe(50);
	});

	test("reads and restores an image as its own reading position", () => {
		const book = dom.window.document.getElementById("book") as HTMLElement;
		book.innerHTML = "A<img id='artwork' alt='' />B";
		const image = dom.window.document.getElementById(
			"artwork",
		) as HTMLImageElement;
		Object.defineProperty(image, "getBoundingClientRect", {
			configurable: true,
			value: () => ({
				top: 100,
				bottom: 300,
				left: 0,
				right: 200,
				width: 200,
				height: 200,
				x: 0,
				y: 100,
				toJSON: () => ({}),
			}),
		});
		Object.defineProperty(dom.window.document, "caretPositionFromPoint", {
			configurable: true,
			value: () => null,
		});
		Object.defineProperty(dom.window.document, "elementsFromPoint", {
			configurable: true,
			// The image is visible below the top reading edge. This is the real
			// EPUB case: hit-testing the edge itself does not land on its pixels.
			value: () => [],
		});
		const calculator = new CharacterStatsCalculator(
			book,
			"horizontal",
			"ltr",
			dom.window.document.documentElement,
			dom.window.document,
		);

		expect(calculator.calcPreciseExploredCharCount()).toBe(1);
		expect(calculator.getScrollPosForCharCount(1, 0)).toBe(100);
	});
});
