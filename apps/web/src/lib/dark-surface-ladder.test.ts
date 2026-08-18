import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

function darkTokens(): Map<string, string> {
	const block = /\n\.dark \{\n([\s\S]*?)\n\}\n/.exec(css);
	if (!block) throw new Error("no .dark block in index.css");
	const tokens = new Map<string, string>();
	for (const line of block[1].matchAll(/^\t(--[\w-]+):\s*([^;]+);/gm)) {
		tokens.set(line[1], line[2].trim());
	}
	return tokens;
}

const tokens = darkTokens();

/** Follows `var(--x)` aliases so an alias and its target compare equal. */
function value(name: string): string {
	const raw = tokens.get(name);
	if (!raw) throw new Error(`${name} missing from .dark`);
	const alias = /^var\((--[\w-]+)\)$/.exec(raw);
	return alias ? value(alias[1]) : raw;
}

function lightness(name: string): number {
	const parsed = /^oklch\(([\d.]+)/.exec(value(name));
	if (!parsed) throw new Error(`${name} is not a plain oklch color`);
	return Number(parsed[1]);
}

describe("dark surface ladder", () => {
	// Rungs, darkest first. The chrome frames the sheet, so it sits below it;
	// inputs are recessed; everything that floats shares one raised step.
	const ladder = [
		"--sidebar",
		"--input",
		"--background",
		"--card",
		"--secondary",
	];

	test("keeps every rung in order", () => {
		const levels = ladder.map(lightness);
		expect(levels).toEqual([...levels].sort((a, b) => a - b));
		expect(new Set(levels).size).toBe(levels.length);
	});

	test("floats menus, popovers and cards on one surface", () => {
		expect(value("--popover")).toBe(value("--card"));
		// Mixing the foreground in (as the light theme does) made menus the
		// brightest thing on screen, off the ladder entirely.
		expect(value("--dropdown")).toBe(value("--popover"));
		expect(value("--muted")).toBe(value("--card"));
	});

	test("gives form fields a veil, never a fixed fill", () => {
		// A fixed fill can only be tuned for one surface: on the chrome the
		// header search vanishes, on a card a settings field does. Which way it
		// leans is a taste knob; that it scales with its surface is not.
		expect(value("--control")).toMatch(
			/^rgba\((?:0, 0, 0|255, 255, 255), 0\.\d+\)$/,
		);
	});

	test("keeps the whole ladder near-black", () => {
		for (const token of ladder) expect(lightness(token)).toBeLessThan(0.32);
		expect(lightness("--foreground")).toBeGreaterThan(0.9);
	});

	test("tints surfaces far below where hue 286 reads lavender", () => {
		for (const token of ladder) {
			const chroma = Number(/^oklch\([\d.]+ ([\d.]+)/.exec(value(token))?.[1]);
			expect(chroma).toBeLessThanOrEqual(0.0095);
		}
	});
});
