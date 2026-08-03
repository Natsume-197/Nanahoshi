import { describe, expect, it } from "bun:test";
import {
	getAccentForegroundColor,
	getMutedAccentSurfaceColor,
} from "@/utils/color";

describe("getAccentForegroundColor", () => {
	it("uses a dark foreground for light cover accents", () => {
		expect(getAccentForegroundColor("#ffffff")).toBe("oklch(0 0 0)");
		expect(getAccentForegroundColor("#e5484d")).toBe("oklch(0 0 0)");
	});

	it("uses a light foreground for dark cover accents", () => {
		expect(getAccentForegroundColor("#000000")).toBe("oklch(1 0 0)");
		expect(getAccentForegroundColor("#5f4b3b")).toBe("oklch(1 0 0)");
	});

	it("supports short hex and falls back safely for invalid values", () => {
		expect(getAccentForegroundColor("#fff")).toBe("oklch(0 0 0)");
		expect(getAccentForegroundColor("not-a-color")).toBe("oklch(1 0 0)");
	});
});

describe("getMutedAccentSurfaceColor", () => {
	it("tones bright cover colors down more aggressively", () => {
		expect(getMutedAccentSurfaceColor("#ffff00")).toBe("rgb(97 95 59)");
		expect(getMutedAccentSurfaceColor("#ffb6c1")).toBe("rgb(107 90 97)");
	});

	it("keeps dark colors recognizable and rejects invalid values", () => {
		expect(getMutedAccentSurfaceColor("#7f3658")).toBe("rgb(91 66 81)");
		expect(getMutedAccentSurfaceColor("not-a-color")).toBeNull();
	});
});
