import { describe, expect, test } from "bun:test";
import { contrastAgainstWhite, getHeroSurfaceColors } from "./color";

describe("getHeroSurfaceColors", () => {
	test("keeps white text readable on every kind of cover", () => {
		for (const cover of [
			"#ffffff",
			"#fff200",
			"#ff66cc",
			"#b0406f",
			"#1a1a2e",
			"#000000",
			"#00ffcc",
			"#3355ff",
		]) {
			const colors = getHeroSurfaceColors(cover);
			expect(colors).not.toBeNull();
			expect(contrastAgainstWhite(colors?.base ?? "")).toBeGreaterThan(4.5);
			expect(contrastAgainstWhite(colors?.deep ?? "")).toBeGreaterThan(4.5);
		}
	});

	test("keeps the cover's hue", () => {
		const colors = getHeroSurfaceColors("#c0306a");
		const [r, g, b] = (colors?.base.match(/\d+/g) ?? []).map(Number);
		expect(r).toBeGreaterThan(g);
		expect(r).toBeGreaterThan(b);
	});

	test("a dark cover is not lifted into a pastel", () => {
		const dark = getHeroSurfaceColors("#1a1a2e");
		const light = getHeroSurfaceColors("#fff200");
		expect(contrastAgainstWhite(dark?.base ?? "")).toBeGreaterThan(
			contrastAgainstWhite(light?.base ?? ""),
		);
	});

	test("no usable color means no hero color", () => {
		expect(getHeroSurfaceColors(null)).toBeNull();
		expect(getHeroSurfaceColors("rgb(1 2 3)")).toBeNull();
	});
});

test("a yellow cover turns amber, not olive", () => {
	const colors = getHeroSurfaceColors("#f3ed07");
	const [r, g, b] = (colors?.base.match(/\d+/g) ?? []).map(Number);
	expect(r).toBeGreaterThan(g);
	expect(g).toBeGreaterThan(b);
	expect(r - g).toBeGreaterThan(15);
});
