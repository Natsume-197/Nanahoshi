import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	parseRailState,
	RAIL_ANIM_MS,
	RAIL_COOKIE_MAX_AGE,
	RAIL_COOKIE_NAME,
	railDirection,
	railStateCookie,
	readRailState,
} from "./rail-state";

describe("parseRailState", () => {
	test("expands by default unless explicitly collapsed", () => {
		expect(parseRailState("expanded")).toBe("expanded");
		expect(parseRailState("collapsed")).toBe("collapsed");
		expect(parseRailState(null)).toBe("expanded");
		expect(parseRailState(undefined)).toBe("expanded");
	});

	test.each([
		["", ""],
		["Expanded", "Expanded"],
		["expanded ", "expanded "],
		["true", "true"],
	])("expands for invalid value %s", (_name, value) => {
		expect(parseRailState(value)).toBe("expanded");
	});
});

describe("readRailState", () => {
	test("reads the cookie wherever it sits in the header", () => {
		expect(readRailState("rail_state=expanded")).toBe("expanded");
		expect(readRailState("theme=dark; rail_state=expanded")).toBe("expanded");
		expect(readRailState("rail_state=expanded; theme=dark")).toBe("expanded");
		expect(readRailState("a=1;rail_state=expanded;b=2")).toBe("expanded");
	});

	test("expands when the cookie is absent or empty", () => {
		expect(readRailState("")).toBe("expanded");
		expect(readRailState(null)).toBe("expanded");
		expect(readRailState("theme=dark; locale=es")).toBe("expanded");
	});

	test("does not match a neighbouring cookie name", () => {
		expect(readRailState("my_rail_state=expanded")).toBe("expanded");
		expect(readRailState("rail_state_backup=expanded")).toBe("expanded");
	});

	test("round-trips what railStateCookie writes", () => {
		expect(readRailState(railStateCookie("expanded"))).toBe("expanded");
		expect(readRailState(railStateCookie("collapsed"))).toBe("collapsed");
	});
});

describe("railStateCookie", () => {
	test("persists site-wide for a year", () => {
		const cookie = railStateCookie("expanded");
		expect(cookie).toStartWith(`${RAIL_COOKIE_NAME}=expanded;`);
		expect(cookie).toContain("path=/");
		expect(cookie).toContain(`max-age=${RAIL_COOKIE_MAX_AGE}`);
		expect(cookie).toContain("samesite=lax");
	});

	test("stays readable by the boot script's inlined regex", () => {
		const header = `theme=dark; ${railStateCookie("expanded").split(";")[0]}`;
		const match = header.match(/(?:^|; )rail_state=([^;]*)/);
		expect(match?.[1]).toBe("expanded");
	});
});

describe("railDirection", () => {
	test("names the way the panel is travelling", () => {
		expect(railDirection("expanded")).toBe("opening");
		expect(railDirection("collapsed")).toBe("closing");
	});
});

describe("open/close motion budget", () => {
	const css = readFileSync(join(import.meta.dir, "../index.css"), "utf8");

	test("every data-rail-anim rule finishes before the attribute is dropped", () => {
		const rules = [
			...css.matchAll(
				/html\[data-rail-anim="[^"]+"\][^{]*\{\s*animation:\s*([^;]+);/g,
			),
		];
		expect(rules.length).toBe(2);
		for (const [, shorthand] of rules) {
			const times = [...(shorthand ?? "").matchAll(/(\d+)ms/g)].map((m) =>
				Number(m[1]),
			);
			expect(times.length).toBe(2);
			expect(times[0]! + times[1]!).toBeLessThanOrEqual(RAIL_ANIM_MS);
		}
	});

	test("both directions are styled", () => {
		expect(css).toContain('html[data-rail-anim="opening"]');
		expect(css).toContain('html[data-rail-anim="closing"]');
		expect(css).toContain("@keyframes rail-open");
		expect(css).toContain("@keyframes rail-close");
	});

	test("the held-back contents use both-fill", () => {
		const anim = css.match(
			/html\[data-rail-anim="opening"\][^{]*\{\s*animation:([^;]+);/,
		);
		expect(anim?.[1]).toContain("both");
	});
});
