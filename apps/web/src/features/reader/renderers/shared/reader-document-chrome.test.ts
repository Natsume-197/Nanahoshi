import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { applyReaderDocumentChrome } from "./reader-document-chrome";

let compactViewport = false;

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
	});
	Object.defineProperty(dom.window, "matchMedia", {
		configurable: true,
		value: () => ({ matches: compactViewport }),
	});
});

afterEach(() => {
	compactViewport = false;
	document.documentElement.removeAttribute("style");
	document.body.removeAttribute("style");
	document.body.className = "";
});

const applyContinuousChrome = () =>
	applyReaderDocumentChrome({
		mode: "continuous",
		verticalMode: false,
		backgroundColor: "black",
	});

const applyVerticalContinuousChrome = () =>
	applyReaderDocumentChrome({
		mode: "continuous",
		verticalMode: true,
		backgroundColor: "black",
	});

describe("reader document chrome", () => {
	test("keeps body-mounted controls horizontal in a vertical document", () => {
		const cleanup = applyVerticalContinuousChrome();

		expect(document.documentElement.style.writingMode).toBe("vertical-rl");
		expect(document.body.style.writingMode).toBe("horizontal-tb");

		cleanup();
		expect(document.body.style.writingMode).toBe("");
	});

	test("does not reserve a native scrollbar gutter on compact viewports", () => {
		compactViewport = true;
		const cleanup = applyContinuousChrome();

		expect(document.documentElement.style.scrollbarWidth).toBe("none");
		cleanup();
	});

	test("keeps the native reading scrollbar on larger pointer-precise screens", () => {
		const cleanup = applyContinuousChrome();

		expect(document.documentElement.style.scrollbarWidth).toBe("auto");
		cleanup();
	});

	test("clears scrollbar concealment when the reader unmounts", () => {
		const cleanup = applyContinuousChrome();
		document.documentElement.classList.add("reader-scrollbar-concealed");

		cleanup();

		expect(
			document.documentElement.classList.contains("reader-scrollbar-concealed"),
		).toBe(false);
	});
});
