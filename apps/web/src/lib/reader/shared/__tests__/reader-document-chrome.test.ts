import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { applyReaderDocumentChrome } from "../reader-document-chrome";

const de = () => document.documentElement.style;

afterEach(() => {
	// guard against a leak between cases if an assertion throws
	document.documentElement.removeAttribute("style");
	document.body.removeAttribute("style");
	document.body.className = "";
});

describe("applyReaderDocumentChrome", () => {
	it("continuous vertical sets the expected chrome and removes all of it", () => {
		const cleanup = applyReaderDocumentChrome({
			mode: "continuous",
			verticalMode: true,
			backgroundColor: "rgb(1, 2, 3)",
			scrollbarColor: "#aaa",
			scrollbarTrackColor: "#bbb",
		});

		expect(de().getPropertyValue("writing-mode")).toBe("vertical-rl");
		expect(de().getPropertyValue("overflow-anchor")).toBe("none");
		expect(de().getPropertyValue("scrollbar-width")).toBe("auto");
		expect(de().getPropertyValue("scrollbar-color")).toBe("#aaa #bbb");
		expect(de().getPropertyValue("touch-action")).toBe("pan-x");
		expect(de().getPropertyValue("overscroll-behavior")).toBe("none");
		expect(de().getPropertyValue("overflow-y")).toBe("hidden");
		expect(de().getPropertyValue("overflow-x")).toBe(""); // not the locked axis
		expect(document.body.style.getPropertyValue("background-color")).toBe(
			"rgb(1, 2, 3)",
		);

		cleanup();

		for (const key of [
			"writing-mode",
			"overflow-anchor",
			"scrollbar-width",
			"scrollbar-color",
			"touch-action",
			"overscroll-behavior",
			"overflow-y",
		]) {
			expect(de().getPropertyValue(key)).toBe("");
		}
		expect(document.body.style.getPropertyValue("background-color")).toBe("");
	});

	it("continuous horizontal locks overflow-x (the off-axis), uses pan-y", () => {
		const cleanup = applyReaderDocumentChrome({
			mode: "continuous",
			verticalMode: false,
			backgroundColor: "rgb(0, 0, 0)",
			scrollbarColor: "#aaa",
			scrollbarTrackColor: "#bbb",
		});
		expect(de().getPropertyValue("writing-mode")).toBe("horizontal-tb");
		expect(de().getPropertyValue("overflow-x")).toBe("hidden");
		expect(de().getPropertyValue("overflow-y")).toBe("");
		expect(de().getPropertyValue("touch-action")).toBe("pan-y");
		cleanup();
		expect(de().getPropertyValue("overflow-x")).toBe("");
	});

	it("paginated uses the overflow-hidden body class and removes it", () => {
		const cleanup = applyReaderDocumentChrome({
			mode: "paginated",
			verticalMode: true,
			backgroundColor: "rgb(9, 9, 9)",
		});
		expect(de().getPropertyValue("writing-mode")).toBe("vertical-rl");
		expect(document.body.classList.contains("overflow-hidden")).toBe(true);
		// paginated does not set the continuous-only scrollbar/touch props
		expect(de().getPropertyValue("touch-action")).toBe("");

		cleanup();
		expect(de().getPropertyValue("writing-mode")).toBe("");
		expect(document.body.classList.contains("overflow-hidden")).toBe(false);
		expect(document.body.style.getPropertyValue("background-color")).toBe("");
	});

	it("cleanup clears scrollbar-color even when the overlay set it (paginated)", () => {
		const cleanup = applyReaderDocumentChrome({
			mode: "paginated",
			verticalMode: false,
			backgroundColor: "rgb(0, 0, 0)",
		});
		// simulate the settings overlay's theme preview tinting the bar
		de().setProperty("scrollbar-color", "#ccc #ddd");
		cleanup();
		expect(de().getPropertyValue("scrollbar-color")).toBe("");
	});
});
