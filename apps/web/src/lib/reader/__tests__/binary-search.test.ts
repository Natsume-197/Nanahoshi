import { describe, expect, it } from "bun:test";
import { binarySearch, binarySearchNoNegative } from "../binary-search";

const arr = [0, 10, 20, 30, 40];

describe("binarySearch (-1 when not found)", () => {
	it("finds an existing element's index", () => {
		expect(binarySearch(arr, 20)).toBe(2);
		expect(binarySearch(arr, 0)).toBe(0);
		expect(binarySearch(arr, 40)).toBe(4);
	});

	it("returns -1 when the value is absent", () => {
		expect(binarySearch(arr, 15)).toBe(-1);
		expect(binarySearch(arr, -5)).toBe(-1);
		expect(binarySearch(arr, 100)).toBe(-1);
	});

	it("handles empty and single-element arrays", () => {
		expect(binarySearch([], 1)).toBe(-1);
		expect(binarySearch([7], 7)).toBe(0);
		expect(binarySearch([7], 8)).toBe(-1);
	});
});

describe("binarySearchNoNegative (clamped index when not found)", () => {
	it("finds an existing element's index", () => {
		expect(binarySearchNoNegative(arr, 30)).toBe(3);
	});

	it("returns the floor index for a value between elements", () => {
		// 15 sits between index 1 (10) and 2 (20) -> floor is 1
		expect(binarySearchNoNegative(arr, 15)).toBe(1);
		expect(binarySearchNoNegative(arr, 39)).toBe(3);
	});

	it("clamps below the first element", () => {
		// not-found below the start returns r after the recursion bottoms out
		expect(binarySearchNoNegative(arr, -5)).toBeLessThanOrEqual(0);
	});

	it("returns the last index for a value above the end", () => {
		expect(binarySearchNoNegative(arr, 100)).toBe(4);
	});
});
