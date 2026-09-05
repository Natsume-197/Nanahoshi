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
			let geometryScale = 1;
			const measure = spyOn(
				dom.window.Range.prototype,
				"getBoundingClientRect",
			).mockImplementation(function (this: Range) {
				const node =
					this.startContainer.nodeType === Node.TEXT_NODE
						? this.startContainer.parentElement
						: (this.startContainer as Element);
				const index = Number(node?.getAttribute("data-index"));
				const edge = Math.floor(index / 2) * 20 * geometryScale;
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
				geometryScale = 2;
				calculator.invalidateParagraphPositions();
				measure.mockClear();
				const fresh = new CharacterStatsCalculator(
					book,
					vertical ? "vertical" : "horizontal",
					vertical ? "rtl" : "ltr",
					scroller,
					document,
				);
				const afterReflow = targets.map((target) =>
					calculator.getCharCountByScrollPos(target),
				);
				expect(afterReflow).not.toEqual(live);
				expect(afterReflow).toEqual(
					targets.map((target) => fresh.getCharCountByScrollPos(target)),
				);
				expect(measure.mock.calls.length).toBeLessThan(400);
				geometryScale = 1;
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

	test("locates a distant chapter without measuring skipped chapter contents", () => {
		const book = document.createElement("main");
		book.innerHTML = Array.from(
			{ length: 40 },
			(_, i) => `<div id="nanahoshi-${i}"><p data-chapter="${i}">AB</p></div>`,
		).join("");
		document.body.append(book);
		for (const [index, section] of Array.from(book.children).entries()) {
			section.getBoundingClientRect = () =>
				({
					top: index * 100,
					bottom: (index + 1) * 100,
					height: 100,
					width: 100,
					left: 0,
					right: 100,
				}) as DOMRect;
		}
		const measure = spyOn(
			dom.window.Range.prototype,
			"getBoundingClientRect",
		).mockImplementation(function (this: Range) {
			const element =
				this.startContainer.nodeType === Node.TEXT_NODE
					? this.startContainer.parentElement
					: (this.startContainer as Element);
			const chapter = Number(element?.getAttribute("data-chapter"));
			expect(chapter).toBe(30);
			return {
				top: 3000,
				bottom: 3080,
				height: 80,
				width: 100,
				left: 0,
				right: 100,
			} as DOMRect;
		});
		try {
			const calculator = new CharacterStatsCalculator(
				book,
				"horizontal",
				"ltr",
				document.documentElement,
				document,
				true,
			);
			expect(calculator.getCharCountByScrollPos(3050)).toBe(60);
			expect(measure.mock.calls.length).toBeLessThan(3);
		} finally {
			measure.mockRestore();
			book.remove();
		}
	});

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

	test("keeps a short first line instead of sampling the following sentence", () => {
		const book = document.createElement("main");
		book.innerHTML = "<p>A</p><p>Following sentence</p>";
		document.body.append(book);
		book.getBoundingClientRect = () =>
			({ left: 0, right: 1000, top: 0, bottom: 700 }) as DOMRect;
		Object.defineProperty(document, "caretPositionFromPoint", {
			configurable: true,
			value: (x: number, y: number) =>
				x < 20 && y < 10
					? { offsetNode: book.firstChild?.firstChild, offset: 0 }
					: { offsetNode: book.lastChild?.firstChild, offset: 0 },
		});
		try {
			const calculator = new CharacterStatsCalculator(
				book,
				"horizontal",
				"ltr",
				book,
				document,
			);
			const saved = calculator.calcPreciseExploredCharCount();
			expect(saved).toBe(0);
			expect(calculator.getReadingEdgeScrollPos(saved)).toBe(0);
		} finally {
			book.remove();
		}
	});

	test("ignores the transparent menu hit area while measuring the visible first line", () => {
		const book = document.createElement("main");
		book.innerHTML = "<p>First visible line</p><p>Following line</p>";
		book.style.lineHeight = "60px";
		const trigger = document.createElement("button");
		trigger.setAttribute("data-reader-position-overlay", "");
		document.body.append(book, trigger);
		book.getBoundingClientRect = () =>
			({ left: 0, right: 1000, top: 0, bottom: 700 }) as DOMRect;
		Object.defineProperty(document, "caretPositionFromPoint", {
			configurable: true,
			value: (_x: number, y: number) => {
				if (y < 32 && trigger.style.pointerEvents !== "none") return null;
				return {
					offsetNode:
						y < 40 ? book.firstChild?.firstChild : book.lastChild?.firstChild,
					offset: 0,
				};
			},
		});
		try {
			const calculator = new CharacterStatsCalculator(
				book,
				"horizontal",
				"ltr",
				book,
				document,
			);
			expect(calculator.calcPreciseExploredCharCount()).toBe(0);
			expect(trigger.style.pointerEvents).toBe("");
		} finally {
			book.remove();
			trigger.remove();
		}
	});

	test("reuses a measured line during scrolling without caret queries or style writes", () => {
		const scroller = document.createElement("main");
		const book = document.createElement("div");
		book.textContent = "abcdefghij".repeat(10);
		scroller.append(book);
		document.body.append(scroller);
		scroller.scrollTop = 24;
		scroller.getBoundingClientRect = () =>
			({ top: 0, left: 0, right: 100, bottom: 100 }) as DOMRect;
		let lineHeight = 20;
		const rect = (line: number) =>
			({
				top: line * lineHeight - scroller.scrollTop,
				bottom: (line + 1) * lineHeight - scroller.scrollTop,
				left: 0,
				right: 100,
				width: 100,
				height: lineHeight,
			}) as DOMRect;
		const prototype = dom.window.Range.prototype;
		const originalRects = Object.getOwnPropertyDescriptor(
			prototype,
			"getClientRects",
		);
		Object.defineProperty(prototype, "getClientRects", {
			configurable: true,
			value: () => Array.from({ length: 10 }, (_, i) => rect(i)),
		});
		const geometry = spyOn(
			prototype,
			"getBoundingClientRect",
		).mockImplementation(function (this: Range) {
			const end =
				this.endContainer.nodeType === Node.TEXT_NODE ? this.endOffset : 100;
			return rect(Math.floor(Math.max(0, end - 1) / 10));
		});
		const caret = spyOn(document, "caretPositionFromPoint" as keyof Document);
		const styles = spyOn(book.style, "setProperty");
		try {
			const calculator = new CharacterStatsCalculator(
				book,
				"horizontal",
				"ltr",
				scroller,
				document,
				true,
			);
			expect(calculator.calcPreciseExploredCharCount()).toBe(10);
			const reads = geometry.mock.calls.length;
			for (let offset = 25; offset < 40; offset++) {
				scroller.scrollTop = offset;
				expect(calculator.calcPreciseExploredCharCount()).toBe(10);
			}
			expect(geometry.mock.calls.length).toBe(reads);
			scroller.scrollTop = 40;
			expect(calculator.calcPreciseExploredCharCount()).toBe(20);
			scroller.scrollTop = 24;
			expect(calculator.calcPreciseExploredCharCount()).toBe(10);
			expect(caret).not.toHaveBeenCalled();
			expect(styles).not.toHaveBeenCalled();
			lineHeight = 40;
			calculator.updateParagraphPos(scroller.scrollTop);
			expect(calculator.calcPreciseExploredCharCount()).toBe(0);
		} finally {
			geometry.mockRestore();
			caret.mockRestore();
			styles.mockRestore();
			scroller.remove();
			if (originalRects)
				Object.defineProperty(prototype, "getClientRects", originalRects);
			else Reflect.deleteProperty(prototype, "getClientRects");
		}
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

for (const vertical of [false, true]) {
	test(`manual bookmark skips a clipped previous line and tolerates the gap (${vertical})`, () => {
		const book = dom.window.document.getElementById("book") as HTMLElement;
		book.textContent = "AAAABBBB";
		const scroller = dom.window.document.createElement("div");
		const viewport = spyOn(scroller, "getBoundingClientRect").mockReturnValue({
			top: 0,
			bottom: 600,
			left: -600,
			right: 0,
			width: 600,
			height: 600,
			x: -600,
			y: 0,
			toJSON() {},
		} as DOMRect);
		const geometry = spyOn(
			dom.window.Range.prototype,
			"getBoundingClientRect",
		).mockImplementation(function (this: Range) {
			const second = this.startOffset >= 4;
			const top = second ? 30 : -18;
			return {
				top,
				bottom: top + 24,
				left: -top - 24,
				right: -top,
				width: 24,
				height: 24,
				x: 0,
				y: top,
				toJSON() {},
			} as DOMRect;
		});
		try {
			const calculator = new CharacterStatsCalculator(
				book,
				vertical ? "vertical" : "horizontal",
				vertical ? "rtl" : "ltr",
				scroller,
				dom.window.document,
			);
			expect(calculator.calcBookmarkCharCount()).toBe(4);
		} finally {
			geometry.mockRestore();
			viewport.mockRestore();
		}
	});
}
