import { expect, test } from "bun:test";
import {
	nextAppBarOffset,
	pinnedRowTop,
	settleAppBarOffset,
} from "./app-bar-scroll";

const H = 64;

test("the bar follows the scroll away and back, within its own height", () => {
	let offset = 0;
	offset = nextAppBarOffset(offset, 100, 130, H);
	expect(offset).toBe(-30);
	offset = nextAppBarOffset(offset, 130, 400, H);
	expect(offset).toBe(-H);
	// Scrolling back up a little reveals it by that much, from anywhere.
	offset = nextAppBarOffset(offset, 900, 880, H);
	expect(offset).toBe(-H + 20);
	offset = nextAppBarOffset(offset, 880, 500, H);
	expect(offset).toBe(0);
});

test("at the top of the list, and on overscroll, the bar is always shown", () => {
	expect(nextAppBarOffset(-H, 40, 0, H)).toBe(0);
	expect(nextAppBarOffset(-H, 10, -30, H)).toBe(0);
});

test("a half-shown bar settles to the nearer end, but never hides at the top", () => {
	expect(settleAppBarOffset(-40, 800, H)).toBe(-H);
	expect(settleAppBarOffset(-20, 800, H)).toBe(0);
	expect(settleAppBarOffset(-40, 30, H)).toBe(0);
});

test("pinned tabs ride with the page, then hold under the bar", () => {
	// Tabs laid out 300pt down, bar bottom at 80.
	expect(pinnedRowTop(300, 0, 80)).toBe(300);
	expect(pinnedRowTop(300, 200, 80)).toBe(100);
	expect(pinnedRowTop(300, 1000, 80)).toBe(80);
	// The bar sliding away takes the pin line up with it.
	expect(pinnedRowTop(300, 1000, 24)).toBe(24);
});
