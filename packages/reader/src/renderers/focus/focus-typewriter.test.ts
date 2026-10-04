import { beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import {
	insertSentenceIndicator,
	prepareTypewriter,
	runTypewriter,
	stepRevealTimes,
	type TypewriterStep,
} from "./focus-typewriter";

let dom: JSDOM;

beforeAll(() => {
	dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, { Node: dom.window.Node });
});

function sentence(html: string) {
	const root = dom.window.document.createElement("div");
	root.innerHTML = html;
	return root;
}

function fakeClock() {
	let time = 0;
	let pending: (() => void) | undefined;
	let nextHandle = 1;
	return {
		clock: {
			now: () => time,
			request: (callback: () => void) => {
				pending = callback;
				return nextHandle++;
			},
			cancel: () => {
				pending = undefined;
			},
		},
		advanceTo(next: number) {
			time = next;
			const callback = pending;
			pending = undefined;
			callback?.();
		},
		get scheduled() {
			return pending !== undefined;
		},
	};
}

const hiddenCount = (root: HTMLElement) =>
	root.querySelectorAll(".focus-typewriter-hidden").length;

describe("focus typewriter preparation", () => {
	test("wraps every glyph while keeping ruby and the sentence text intact", () => {
		const root = sentence("<p>朝<ruby>焼<rt>や</rt></ruby>け<em>だ</em>。</p>");
		const steps = prepareTypewriter(root);

		expect(steps.map((step) => step.element.textContent)).toEqual([
			"朝",
			"焼や",
			"け",
			"だ",
			"。",
		]);
		expect(root.querySelector("ruby")?.innerHTML).toBe("焼<rt>や</rt>");
		expect(root.textContent).toBe("朝焼やけだ。");
		expect(hiddenCount(root)).toBe(steps.length);
	});

	test("holds the beat after punctuation, never before it", () => {
		const steps = prepareTypewriter(sentence("<p>a b、c。d</p>"));

		expect(steps.map((step) => step.cost)).toEqual([1, 0, 1, 1, 3, 1, 7]);
	});

	test("the last glyph never waits on its own punctuation", () => {
		const steps = prepareTypewriter(sentence("<p>その通り。</p>"));

		expect(steps.map((step) => step.cost)).toEqual([1, 1, 1, 1, 1]);
	});

	test("keeps surrogate pairs whole", () => {
		const steps = prepareTypewriter(sentence("<p>𠮷野</p>"));

		expect(steps.map((step) => step.element.textContent)).toEqual(["𠮷", "野"]);
	});
});

describe("focus typewriter playback", () => {
	test("reveals glyph by glyph and settles once at the end", () => {
		const root = sentence("<p>abc</p>");
		const steps = prepareTypewriter(root);
		const { clock, advanceTo } = fakeClock();
		let finished = 0;

		const handle = runTypewriter(steps, {
			charactersPerSecond: 100,
			onFinish: () => {
				finished += 1;
			},
			clock,
		});

		advanceTo(10);
		expect(hiddenCount(root)).toBe(2);
		advanceTo(20);
		expect(hiddenCount(root)).toBe(1);
		expect(finished).toBe(0);
		advanceTo(30);
		expect(hiddenCount(root)).toBe(0);
		expect(finished).toBe(1);

		handle.finish();
		expect(finished).toBe(1);
	});

	test("finish reveals the rest of the line at once, as a mid-line click does", () => {
		const root = sentence("<p>abcdef</p>");
		const steps = prepareTypewriter(root);
		const { clock, advanceTo } = fakeClock();
		let finished = 0;

		const handle = runTypewriter(steps, {
			charactersPerSecond: 10,
			onFinish: () => {
				finished += 1;
			},
			clock,
		});
		advanceTo(100);
		expect(hiddenCount(root)).toBe(5);

		handle.finish();
		expect(hiddenCount(root)).toBe(0);
		expect(finished).toBe(1);
	});

	test("stop leaves the sentence alone and never settles", () => {
		const root = sentence("<p>abc</p>");
		const steps = prepareTypewriter(root);
		const fake = fakeClock();
		let finished = 0;

		const handle = runTypewriter(steps, {
			charactersPerSecond: 10,
			onFinish: () => {
				finished += 1;
			},
			clock: fake.clock,
		});
		handle.stop();

		expect(fake.scheduled).toBe(false);
		expect(hiddenCount(root)).toBe(3);
		expect(finished).toBe(0);
	});

	test("reveal times accumulate the per-glyph pauses", () => {
		const steps = [{ cost: 1 }, { cost: 0 }, { cost: 3 }] as TypewriterStep[];

		expect(stepRevealTimes(steps, 100)).toEqual([10, 10, 40]);
	});
});

describe("sentence indicator", () => {
	test("stays out of the line so the text cannot shift when it lands", () => {
		const root = sentence("<p>ほら<ruby>桜<rt>さくら</rt></ruby>。</p>");
		const steps = prepareTypewriter(root);

		const indicator = insertSentenceIndicator(root, steps.at(-1)?.element);

		expect(indicator?.parentElement).toBe(root);
		expect(indicator?.style.position).toBe("");
		expect(root.querySelector("p .focus-sentence-indicator")).toBe(null);
		expect(indicator?.getAttribute("aria-hidden")).toBe("true");
	});

	test("works on an untyped sentence and leaves its text alone", () => {
		const root = sentence("<p>終わり。 </p>");

		const indicator = insertSentenceIndicator(root);

		expect(indicator?.parentElement).toBe(root);
		expect(root.querySelector("p")?.textContent).toBe("終わり。 ");
	});

	test("re-placing replaces the marker instead of stacking them", () => {
		const root = sentence("<p>また。</p>");

		insertSentenceIndicator(root);
		insertSentenceIndicator(root);

		expect(root.querySelectorAll(".focus-sentence-indicator").length).toBe(1);
	});

	test("returns nothing when the sentence has no glyph to trail", () => {
		expect(insertSentenceIndicator(sentence('<p><img src="a.png"></p>'))).toBe(
			undefined,
		);
	});
});
