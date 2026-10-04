import { expect, test } from "bun:test";
import { wantsLightStatusBar } from "./chrome-color";

test("dark reader themes get light status bar content", () => {
	expect(wantsLightStatusBar("oklch(0.21 0 0)")).toBe(true);
	expect(wantsLightStatusBar("#1f1f20")).toBe(true);
	expect(wantsLightStatusBar("rgb(31, 31, 32)")).toBe(true);
});

test("light and sepia themes keep dark status bar content", () => {
	expect(wantsLightStatusBar("oklch(0.98 0.01 80)")).toBe(false);
	expect(wantsLightStatusBar("#f4ecd8")).toBe(false);
	expect(wantsLightStatusBar("#fff")).toBe(false);
});

test("an unknown color keeps dark content", () => {
	expect(wantsLightStatusBar("var(--background)")).toBe(false);
});
