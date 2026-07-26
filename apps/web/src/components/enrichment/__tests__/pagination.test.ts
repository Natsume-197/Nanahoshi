import { describe, expect, test } from "bun:test";
import { visiblePageNumbers } from "../pagination";

describe("visiblePageNumbers", () => {
	test("shows every page when the result set is short", () => {
		expect(visiblePageNumbers(2, 3)).toEqual([1, 2, 3]);
	});

	test("keeps the first, last, and neighboring pages visible", () => {
		expect(visiblePageNumbers(5, 10)).toEqual([1, 4, 5, 6, 10]);
	});

	test("offers the first pages directly from the beginning", () => {
		expect(visiblePageNumbers(1, 10)).toEqual([1, 2, 3, 4, 5, 10]);
	});

	test("clamps stale page indexes after the result set shrinks", () => {
		expect(visiblePageNumbers(12, 4)).toEqual([1, 2, 3, 4]);
	});
});
