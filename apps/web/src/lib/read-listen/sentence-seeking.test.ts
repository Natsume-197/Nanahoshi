import { beforeEach, describe, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";
import { bindReadListenSentenceSeeking } from "./sentence-seeking";

const readerCss = await Bun.file(
	new URL("../../features/reader/ui/styles/reader.css", import.meta.url),
).text();
let pendingAnimationFrame: FrameRequestCallback | undefined;

beforeEach(() => {
	pendingAnimationFrame = undefined;
	Object.assign(globalThis, {
		requestAnimationFrame: mock((callback: FrameRequestCallback) => {
			pendingAnimationFrame = callback;
			return 1;
		}),
		cancelAnimationFrame: mock(() => {
			pendingAnimationFrame = undefined;
		}),
	});
});

function flushAnimationFrame() {
	const callback = pendingAnimationFrame;
	pendingAnimationFrame = undefined;
	callback?.(0);
}

function createHarness({
	textContent = "First sentence.",
	cueText = textContent,
	cueTexts,
	caretOffset,
	characterRect,
}: {
	textContent?: string;
	cueText?: string;
	cueTexts?: string[];
	caretOffset: number;
	characterRect: (
		offset: number,
	) => { left: number; right: number; top: number; bottom: number } | undefined;
}) {
	const dom = new JSDOM(`<style>${readerCss}</style>
		<main><section id="chapter" class="book-content"><p>${textContent}</p></section></main>`);
	const document = dom.window.document;
	let pendingIdleCallback: IdleRequestCallback | undefined;
	Object.defineProperty(dom.window, "requestIdleCallback", {
		value: (callback: IdleRequestCallback) => {
			pendingIdleCallback = callback;
			return 1;
		},
	});
	Object.defineProperty(dom.window, "cancelIdleCallback", {
		value: () => {
			pendingIdleCallback = undefined;
		},
	});
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
	const setHighlight = mock(() => {});
	Object.defineProperty(dom.window, "CSS", {
		configurable: true,
		value: {
			highlights: {
				set: setHighlight,
				delete: () => true,
			},
		},
	});
	Object.defineProperty(dom.window, "Highlight", {
		configurable: true,
		value: class Highlight {},
	});
	const activate = mock(() => {});
	const cleanup = bindReadListenSentenceSeeking({
		surface,
		targetsBySection: new Map([
			[
				"chapter",
				(cueTexts ?? [cueText]).map((exact, index) => ({
					anchor: {
						kind: "text-quote" as const,
						sectionRef: "chapter.xhtml",
						exact,
					},
					value: `cue-${index + 1}`,
				})),
			],
		]),
		onActivate: activate,
		keyboardLabel:
			"Book text. Use the arrow keys to choose a sentence, then press Enter.",
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
	const dispatchPointerMove = (
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
	const movePointer = (
		clientX: number,
		clientY: number,
		nextCaretOffset = caretOffset,
	) => {
		dispatchPointerMove(clientX, clientY, nextCaretOffset);
		flushAnimationFrame();
	};
	return {
		activate,
		cleanup,
		click,
		movePointer,
		movePointerImmediately: dispatchPointerMove,
		setHighlight,
		caretPositionFromPoint,
		surface,
		createTreeWalker,
		flushIdle: () => {
			const callback = pendingIdleCallback;
			pendingIdleCallback = undefined;
			callback?.({
				didTimeout: false,
				timeRemaining: () => 50,
			});
		},
		cursor: () => dom.window.getComputedStyle(paragraph).cursor,
		keyboardSurface: section as HTMLElement,
		pressKey: (key: string) => {
			section.dispatchEvent(
				new dom.window.KeyboardEvent("keydown", { bubbles: true, key }),
			);
		},
	};
}

function createMultiSectionHarness() {
	const dom = new JSDOM(`
		<main>
			<section id="chapter-one" class="book-content"><p>First.</p></section>
			<section id="chapter-two" class="book-content"><p>Second.</p></section>
		</main>`);
	const document = dom.window.document;
	const idleCallbacks: IdleRequestCallback[] = [];
	Object.defineProperty(dom.window, "requestIdleCallback", {
		value: (callback: IdleRequestCallback) => {
			idleCallbacks.push(callback);
			return idleCallbacks.length;
		},
	});
	Object.defineProperty(dom.window, "cancelIdleCallback", {
		value: () => {},
	});
	const createTreeWalker = mock(document.createTreeWalker.bind(document));
	Object.defineProperty(document, "createTreeWalker", {
		value: createTreeWalker,
	});
	const surface = document.querySelector("main");
	const visibleParagraph = document.querySelector("#chapter-two p");
	if (!surface || !visibleParagraph) throw new Error("fixture surface missing");
	Object.defineProperty(document, "elementFromPoint", {
		value: () => visibleParagraph,
	});
	const cleanup = bindReadListenSentenceSeeking({
		surface,
		targetsBySection: new Map([
			[
				"chapter-one",
				[
					{
						anchor: {
							kind: "text-quote" as const,
							sectionRef: "one.xhtml",
							exact: "First.",
						},
						value: "cue-one",
					},
				],
			],
			[
				"chapter-two",
				[
					{
						anchor: {
							kind: "text-quote" as const,
							sectionRef: "two.xhtml",
							exact: "Second.",
						},
						value: "cue-two",
					},
				],
			],
		]),
		onActivate: () => {},
		keyboardLabel: "Book text",
	});
	createTreeWalker.mockClear();
	return {
		cleanup,
		createTreeWalker,
		flushNextIdle: () => {
			idleCallbacks.shift()?.({
				didTimeout: false,
				timeRemaining: () => 50,
			});
		},
	};
}

describe("Read & Listen sentence seeking", () => {
	test("installs the hover highlight in the same pointer event", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		harness.movePointerImmediately(50, 10);

		expect(harness.setHighlight).toHaveBeenCalledTimes(1);
		harness.cleanup();
	});

	test("reuses the current sentence geometry while the pointer stays inside it", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		harness.movePointer(40, 10);
		harness.movePointerImmediately(60, 10);

		expect(harness.caretPositionFromPoint).toHaveBeenCalledTimes(1);
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

	test("shows the pointer cursor only while hovering rendered text", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		harness.movePointer(200, 200);
		expect(harness.cursor()).not.toBe("pointer");

		harness.movePointer(50, 10);
		expect(harness.cursor()).toBe("pointer");

		harness.movePointer(200, 200);
		expect(harness.cursor()).not.toBe("pointer");

		harness.movePointer(50, 10);
		expect(harness.cursor()).toBe("pointer");
		harness.cleanup();
		expect(harness.cursor()).not.toBe("pointer");
	});

	test("keeps the cursor state stable while crossing aligned sentences", () => {
		const harness = createHarness({
			textContent: "First. Second.",
			cueTexts: ["First.", "Second."],
			caretOffset: 5,
			characterRect: (offset) =>
				offset < 7
					? { left: 0, right: 49, top: 0, bottom: 20 }
					: { left: 51, right: 100, top: 0, bottom: 20 },
		});
		harness.movePointer(25, 10, 2);
		const view = harness.surface.ownerDocument.defaultView;
		if (!view) throw new Error("fixture window missing");
		const observer = new view.MutationObserver(() => {});
		observer.observe(harness.surface, { attributes: true });

		harness.movePointer(75, 10, 9);

		expect(harness.cursor()).toBe("pointer");
		expect(
			observer
				.takeRecords()
				.filter(
					(record) => record.attributeName === "data-read-listen-sentence-hit",
				),
		).toHaveLength(0);
		observer.disconnect();
		harness.cleanup();
	});

	test("builds the section index while the reader is idle", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		expect(harness.createTreeWalker).not.toHaveBeenCalled();
		harness.flushIdle();
		expect(harness.createTreeWalker).toHaveBeenCalledTimes(1);

		harness.movePointer(50, 10);
		expect(harness.createTreeWalker).toHaveBeenCalledTimes(1);
		harness.cleanup();
	});

	test("warms at most one section index per idle task", () => {
		const harness = createMultiSectionHarness();

		harness.flushNextIdle();

		expect(harness.createTreeWalker).toHaveBeenCalledTimes(1);
		expect(harness.createTreeWalker.mock.calls[0]?.[0]).toHaveProperty(
			"id",
			"chapter-two",
		);
		harness.flushNextIdle();
		expect(harness.createTreeWalker).toHaveBeenCalledTimes(2);
		harness.cleanup();
	});

	test("does not show the pointer or activate text outside an aligned cue", () => {
		const harness = createHarness({
			textContent: "合図。対象外。",
			cueText: "合図。",
			caretOffset: 3,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		harness.movePointer(50, 10);
		expect(harness.cursor()).not.toBe("pointer");
		harness.click(50, 10);
		expect(harness.activate).not.toHaveBeenCalled();
		harness.cleanup();
	});

	test("lets keyboard users select and activate an aligned sentence", () => {
		const harness = createHarness({
			caretOffset: 5,
			characterRect: () => ({ left: 0, right: 100, top: 0, bottom: 20 }),
		});

		expect(harness.keyboardSurface.getAttribute("role")).toBe("region");
		expect(harness.keyboardSurface.tabIndex).toBe(0);
		harness.keyboardSurface.focus();
		harness.pressKey("Enter");

		expect(harness.activate).toHaveBeenCalledWith("cue-1");
		harness.cleanup();
		expect(harness.keyboardSurface.hasAttribute("role")).toBe(false);
		expect(harness.keyboardSurface.hasAttribute("tabindex")).toBe(false);
	});
});
