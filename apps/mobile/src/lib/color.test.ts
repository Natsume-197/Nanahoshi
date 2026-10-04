import { expect, test } from "bun:test";
import { ambientScene } from "./color";

const lightness = ([r, g, b]: [number, number, number]) =>
	(Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;

test("any cover lands on the same dark base under white text", () => {
	for (const color of ["#ffe600", "#1e3a8a", "#8b5a2b", null]) {
		const base = ambientScene(color).base.match(/\d+/g)?.map(Number) ?? [];
		expect(lightness(base as [number, number, number])).toBeLessThan(0.13);
	}
});

test("the glows keep the cover's hue family", () => {
	const [r, , b] = ambientScene("#2255dd").glow;
	expect(b).toBeGreaterThan(r);
});

test("a gold cover glows gold, not brown", () => {
	const [r, g, b] = ambientScene("#f4ae43").glow;
	expect(r).toBeGreaterThan(200);
	expect(g).toBeGreaterThan(b + 60);
});

test("a yellow cover glows softer than a blue one and keeps a neutral base", () => {
	const yellow = ambientScene("#f3ed07");
	expect(yellow.strength).toBeLessThan(ambientScene("#2e759b").strength);
	const [r, g, b] = yellow.base.match(/\d+/g)?.map(Number) ?? [];
	expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(8);
});
