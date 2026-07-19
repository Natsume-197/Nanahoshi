import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import {
	refreshThemeColor,
	resetThemeColor,
	setThemeColor,
} from "../theme-color";

const meta = () =>
	document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

afterEach(() => {
	// restore the module's chrome default and drop the tag between cases
	resetThemeColor();
	meta()?.remove();
});

describe("theme-color", () => {
	it("creates the meta tag when missing and writes the color", () => {
		expect(meta()).toBeNull();
		setThemeColor("rgb(1, 2, 3)");
		expect(meta()?.content).toBe("rgb(1, 2, 3)");
	});

	it("updates an existing meta tag in place", () => {
		const existing = document.createElement("meta");
		existing.name = "theme-color";
		existing.content = "#0e0e10";
		document.head.appendChild(existing);

		setThemeColor("rgb(9, 9, 9)");

		expect(document.querySelectorAll('meta[name="theme-color"]').length).toBe(
			1,
		);
		expect(existing.content).toBe("rgb(9, 9, 9)");
	});

	it("resetThemeColor restores the app chrome source", () => {
		setThemeColor("rgb(4, 5, 6)");
		resetThemeColor();
		// jsdom can't resolve var() through the probe, so the raw source leaks
		// through — in a real browser this resolves to the rgb() of --background.
		expect(meta()?.content).toBe("var(--background)");
	});

	it("refreshThemeColor re-applies the current color after tampering", () => {
		setThemeColor("rgb(7, 8, 9)");
		const tag = meta();
		if (!tag) throw new Error("meta missing");
		tag.content = "#ffffff";
		refreshThemeColor();
		expect(tag.content).toBe("rgb(7, 8, 9)");
	});
});
