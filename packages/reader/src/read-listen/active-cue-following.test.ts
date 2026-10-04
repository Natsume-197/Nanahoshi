import { describe, expect, it, mock } from "bun:test";
import { JSDOM } from "jsdom";
import {
	bindReadListenManualFollowPause,
	resolveActiveCueFollowDecision,
} from "./active-cue-following";

const viewport = { start: 0, end: 1000 };

describe("active cue following", () => {
	it("does not scroll while the sentence remains in the reading comfort zone", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				cue: { start: 360, end: 430 },
				viewport,
			}),
		).toEqual({ scroll: false, showResume: false });
	});

	it("moves once when narration leaves the comfort zone", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				cue: { start: 820, end: 890 },
				viewport,
			}),
		).toEqual({ scroll: true, showResume: false });
	});

	it("lets manual reading win until the user resumes narration", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "suspended",
				cue: { start: 820, end: 890 },
				viewport,
			}),
		).toEqual({ scroll: false, showResume: true });

		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				force: true,
				cue: { start: 360, end: 430 },
				viewport,
			}),
		).toEqual({ scroll: true, showResume: false });
	});

	it("accounts for reader chrome and the persistent player", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				cue: { start: 720, end: 790 },
				viewport,
				startInset: 96,
				endInset: 180,
			}),
		).toEqual({ scroll: true, showResume: false });
	});

	it("keeps a visible sentence stable in paginated layouts", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				strategy: "visibility",
				cue: { start: 780, end: 920 },
				viewport,
			}),
		).toEqual({ scroll: false, showResume: false });
	});
});

describe("paginated manual following gestures", () => {
	for (const kind of ["pointermove", "touchmove"] as const) {
		it(`does not suspend narration for unhandled ${kind} in a page`, () => {
			const dom = new JSDOM(
				'<main><div class="book-content book-content--paginated"><p>文。</p></div></main>',
			);
			const surface = dom.window.document.querySelector("main");
			const paragraph = dom.window.document.querySelector("p");
			if (!surface || !paragraph) throw new Error("Missing gesture fixture");
			const onPause = mock(() => {});
			const unbind = bindReadListenManualFollowPause({ surface, onPause });
			const event = new dom.window.Event(kind, {
				bubbles: true,
				cancelable: true,
			});
			Object.assign(event, {
				pointerType: "touch",
				buttons: 1,
				movementX: 2,
				movementY: 1,
			});
			paragraph.dispatchEvent(event);
			paragraph.dispatchEvent(
				new dom.window.Event("touchend", { bubbles: true, cancelable: true }),
			);
			expect(onPause).not.toHaveBeenCalled();
			// The page renderer consumes touchend only after recognizing its swipe.
			paragraph.addEventListener(
				"touchend",
				(event) => event.preventDefault(),
				{ once: true },
			);
			paragraph.dispatchEvent(
				new dom.window.Event("touchend", { bubbles: true, cancelable: true }),
			);
			expect(onPause).toHaveBeenCalledTimes(1);
			unbind();
			dom.window.close();
		});
	}
	it("continues to suspend following for touch scrolling in continuous text", () => {
		const dom = new JSDOM(
			'<main><div class="book-content book-content--continuous"><p>文。</p></div></main>',
		);
		const surface = dom.window.document.querySelector("main");
		const paragraph = dom.window.document.querySelector("p");
		if (!surface || !paragraph) throw new Error("Missing gesture fixture");
		const onPause = mock(() => {});
		const unbind = bindReadListenManualFollowPause({ surface, onPause });
		paragraph.dispatchEvent(
			new dom.window.Event("touchmove", { bubbles: true }),
		);
		expect(onPause).toHaveBeenCalledTimes(1);
		unbind();
		dom.window.close();
	});
});
