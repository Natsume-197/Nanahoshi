import { expect, mock, test } from "bun:test";
import { ambientScene } from "@/lib/color";

// The theme pulls in React Native and the fonts; only `palettes` is read.
mock.module("@/theme", () => ({
	palettes: { dark: { card: "#000" } },
	usePalette: () => ({}),
}));
const { ink } = await import("./ink");

const linear = (v: number) => {
	const c = v / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: number[]) =>
	0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const over = (under: number[], top: number[], alpha: number) =>
	under.map((v, i) => v + (top[i] - v) * alpha);
const contrast = (a: number[], b: number[]) =>
	(luminance(a) + 0.05) / (luminance(b) + 0.05);
const rgba = (color: string) => color.match(/[\d.]+/g)?.map(Number) ?? [];

test("the player's secondary text holds 4.5:1 over any cover's scene", () => {
	const [r, g, b, alpha] = rgba(ink.muted);
	for (const cover of [
		"#ffff00",
		"#ffffff",
		"#88ccff",
		"#40e0d0",
		"#f5d0a0",
		"#ff66cc",
		null,
	]) {
		const scene = ambientScene(cover);
		const base = rgba(scene.base);
		// The low glow sits under the title, times and bottom row.
		const behind = over(base, scene.accent, 0.3 * scene.strength);
		const text = over(behind, [r, g, b], alpha);
		expect(contrast(text, behind)).toBeGreaterThanOrEqual(4.5);
	}
});
