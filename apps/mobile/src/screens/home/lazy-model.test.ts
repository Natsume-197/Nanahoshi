import { expect, test } from "bun:test";
import { shouldRevealMore } from "./lazy-model";

const SCREEN = 800;

test("a short page keeps revealing until it fills a screen of lookahead", () => {
	expect(shouldRevealMore(0, SCREEN, 1200)).toBe(true);
	expect(shouldRevealMore(0, SCREEN, 2000)).toBe(false);
});

test("scrolling down brings the next section in a screen ahead", () => {
	expect(shouldRevealMore(300, SCREEN, 2000)).toBe(false);
	expect(shouldRevealMore(400, SCREEN, 2000)).toBe(true);
});

test("while a new section is measuring, nothing more mounts", () => {
	expect(shouldRevealMore(5000, SCREEN, Number.POSITIVE_INFINITY)).toBe(false);
});
