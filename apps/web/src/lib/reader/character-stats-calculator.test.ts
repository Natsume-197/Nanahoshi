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
});
