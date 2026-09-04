import { beforeAll, describe, expect, spyOn, test } from "bun:test";
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
	for (const vertical of [false, true]) {
		test(`live geometry matches the complete index, including shared edges and empty nodes (${vertical ? "vertical" : "horizontal"})`, async () => {
			const scroller = document.createElement("main");
			const book = document.createElement("div");
			scroller.append(book);
			document.body.append(scroller);
			book.innerHTML = Array.from(
				{ length: 2000 },
				(_, i) => `<p data-index="${i}">X</p>`,
			).join("");
			const scrollProp = vertical ? "scrollLeft" : "scrollTop";
			scroller[scrollProp] = vertical ? -100 : 100;
			scroller.getBoundingClientRect = () =>
				({
					top: 0,
					left: 0,
					right: 800,
					bottom: 600,
					width: 800,
					height: 600,
				}) as DOMRect;
			const measure = spyOn(
				dom.window.Range.prototype,
				"getBoundingClientRect",
			).mockImplementation(function (this: Range) {
				const node =
					this.startContainer.nodeType === Node.TEXT_NODE
						? this.startContainer.parentElement
						: (this.startContainer as Element);
				const index = Number(node?.getAttribute("data-index"));
				const edge = Math.floor(index / 2) * 20;
				const size = index % 13 === 0 ? 0 : 10;
				const top = edge - scroller.scrollTop;
				const right = 800 - edge - scroller.scrollLeft;
				return {
					top,
					bottom: top + size,
					left: right - size,
					right,
					width: size,
					height: size,
				} as DOMRect;
			});
			const scheduler = Object.getOwnPropertyDescriptor(
				globalThis,
				"scheduler",
			);
			try {
				const calculator = new CharacterStatsCalculator(
					book,
					vertical ? "vertical" : "horizontal",
					vertical ? "rtl" : "ltr",
					scroller,
					document,
				);
				const targets = [0, 10, 11, 30, 500, 9999, 15000, 30000];
				const live = targets.map((target) =>
					calculator.getCharCountByScrollPos(target),
				);
				expect(live.slice(0, 4)).toEqual([1, 2, 2, 4]);
				expect(measure.mock.calls.length).toBeLessThan(200);
				// Scroll between batches: viewport-relative rects move, but their
				// absolute reading coordinates must remain identical to the live lookup.
				Object.defineProperty(globalThis, "scheduler", {
					configurable: true,
					value: {
						yield: async () => {
							scroller[scrollProp] += vertical ? -10 : 10;
						},
					},
				});
				expect(await calculator.updateParagraphPosCooperative()).toBe(true);
				expect(
					targets.map((target) => calculator.getCharCountByScrollPos(target)),
				).toEqual(live);
				let cancelled = false;
				Object.defineProperty(globalThis, "scheduler", {
					configurable: true,
					value: {
						yield: async () => {
							cancelled = true;
						},
					},
				});
				expect(
					await calculator.updateParagraphPosCooperative(
						undefined,
						() => cancelled,
					),
				).toBe(false);
				expect(
					targets.map((target) => calculator.getCharCountByScrollPos(target)),
				).toEqual(live);
			} finally {
				measure.mockRestore();
				scroller.remove();
				if (scheduler)
					Object.defineProperty(globalThis, "scheduler", scheduler);
				else Reflect.deleteProperty(globalThis, "scheduler");
			}
		});
	}

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
