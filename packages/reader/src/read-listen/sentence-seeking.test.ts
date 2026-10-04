import { describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import { bindReadListenSentenceSeeking } from "./sentence-seeking";

function createHarness({
	textContent = "First sentence.",
	cueText = textContent,
	caretOffset,
	characterRect,
}: {
	textContent?: string;
	cueText?: string;
	caretOffset: number;
	characterRect: (
		offset: number,
	) => { left: number; right: number; top: number; bottom: number } | undefined;
}) {
	const dom = new JSDOM(
		`<main><section id="chapter" class="book-content"><p>${textContent}</p></section></main>`,
	);
	const document = dom.window.document;
	const createTreeWalker = mock(document.createTreeWalker.bind(document));
	Object.defineProperty(document, "createTreeWalker", {
		value: createTreeWalker,
	});
	const surface = document.querySelector("main");
	const section = document.querySelector("section");
	const paragraph = document.querySelector("p");
	const text = paragraph?.firstChild;
	if (!surface || !section || !paragraph || !text || text.nodeType !== 3) {
		throw new Error("fixture text missing");
	}
	let currentCaretOffset = caretOffset;
	const caretPositionFromPoint = mock(() => ({
		offsetNode: text,
		offset: currentCaretOffset,
	}));
	Object.defineProperty(document, "caretPositionFromPoint", {
		value: caretPositionFromPoint,
	});
	Object.defineProperty(dom.window.Range.prototype, "getClientRects", {
		value(this: Range) {
			const rect = characterRect(this.startOffset);
			return rect ? [rect] : [];
		},
	});
	const activate = mock(() => {});
	const cleanup = bindReadListenSentenceSeeking({
		surface,
		targetsBySection: new Map([
			[
				"chapter",
				[
					{
						anchor: {
							kind: "text-quote" as const,
							sectionRef: "chapter.xhtml",
							exact: cueText,
						},
						value: "cue-1",
					},
				],
			],
		]),
		onActivate: activate,
	});
	createTreeWalker.mockClear();
	const click = (clientX: number, clientY: number) => {
		section.dispatchEvent(
			new dom.window.MouseEvent("click", {
				bubbles: true,
				clientX,
				clientY,
			}),
		);
	};
	const movePointer = (
		clientX: number,
		clientY: number,
		nextCaretOffset = caretOffset,
	) => {
		currentCaretOffset = nextCaretOffset;
		section.dispatchEvent(
			new dom.window.MouseEvent("pointermove", {
				bubbles: true,
				clientX,
				clientY,
			}),
		);
	};
	return {
		activate,
		cleanup,
		click,
		movePointer,
		caretPositionFromPoint,
		createTreeWalker,
		pressKey: (key: string) => {
			const event = new dom.window.KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				key,
			});
			section.dispatchEvent(event);
			return event;
		},
	};
}

describe("Read & Listen sentence seeking", () => {
	test("does no work while the pointer moves", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		for (let index = 0; index < 20; index += 1) {
			harness.movePointer(50 + index, 10);
		}

		expect(harness.caretPositionFromPoint).not.toHaveBeenCalled();
		expect(harness.createTreeWalker).not.toHaveBeenCalled();
		harness.cleanup();
	});

	test("does not activate a sentence when the click lands outside rendered text", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		harness.click(200, 200);

		expect(harness.activate).not.toHaveBeenCalled();
		harness.cleanup();
	});

	test("activates a sentence when the click lands on a rendered character", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		harness.click(50, 10);

		expect(harness.activate).toHaveBeenCalledWith("cue-1");
		harness.cleanup();
	});

	test("does not activate a sentence from whitespace between words", () => {
		const harness = createHarness({
			textContent: "First sentence.",
			caretOffset: 5,
			characterRect: (offset) =>
				offset === 4
					? { left: 30, right: 40, top: 0, bottom: 20 }
					: { left: 50, right: 60, top: 0, bottom: 20 },
		});

		harness.click(45, 10);

		expect(harness.activate).not.toHaveBeenCalled();
		harness.cleanup();
	});

	test("does not activate text outside an aligned cue", () => {
		const harness = createHarness({
			textContent: "合図。対象外。",
			cueText: "合図。",
			caretOffset: 3,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		harness.click(50, 10);

		expect(harness.activate).not.toHaveBeenCalled();
		harness.cleanup();
	});

	test("does not capture arrows that the paginated reader uses for page turns", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		const event = harness.pressKey("ArrowRight");

		expect(event.defaultPrevented).toBe(false);
		harness.cleanup();
	});
});
