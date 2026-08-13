import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

describe("mobile notification motion", () => {
	it("uses Base UI's symmetric starting and ending states", () => {
		expect(css).toContain(".mobile-notifications-sheet[data-starting-style]");
		expect(css).toContain(".mobile-notifications-sheet[data-ending-style]");
	});

	it("uses interruptible transform transitions instead of sheet keyframes", () => {
		expect(css).toContain("--notification-sheet-open-dur: 280ms");
		expect(css).toContain("--notification-sheet-close-dur: 220ms");
		expect(css).toContain("transition-property: transform, opacity");
	});
});
