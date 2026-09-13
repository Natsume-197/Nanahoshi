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

// Assert shared surface roles rather than freezing a particular color notation.
describe("dark surfaces", () => {
	test("uses a consistent surface for cards and floating menus", () => {
		expect(value("--popover")).toBe(value("--card"));
		expect(value("--dropdown")).toBe(value("--popover"));
		expect(value("--surface-card")).toBe(value("--card"));
		expect(value("--card")).not.toBe(value("--background"));
	});

	test("shares the input surface across controls and preserves hover feedback", () => {
		expect(value("--control")).toBe(value("--input"));
		expect(value("--surface-hover")).toBe(value("--muted"));
		expect(value("--muted")).not.toBe(value("--background"));
	});
});
