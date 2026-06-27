import { describe, expect, it } from "bun:test";
import { formatPos } from "../format-pos";

describe("formatPos", () => {
	it("is the identity for ltr", () => {
		expect(formatPos(100, "ltr")).toBe(100);
		expect(formatPos(-100, "ltr")).toBe(-100);
		expect(formatPos(0, "ltr")).toBe(0);
	});

	it("negates for rtl", () => {
		expect(formatPos(100, "rtl")).toBe(-100);
		expect(formatPos(-100, "rtl")).toBe(100);
		expect(formatPos(0, "rtl")).toBe(-0);
	});

	it("is its own inverse for rtl", () => {
		expect(formatPos(formatPos(42, "rtl"), "rtl")).toBe(42);
	});
});
