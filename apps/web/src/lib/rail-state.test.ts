import { describe, expect, test } from "bun:test";
import {
	clampRailWidth,
	parseRailState,
	RAIL_COLLAPSE_THRESHOLD,
	RAIL_COOKIE_MAX_AGE,
	RAIL_COOKIE_NAME,
	RAIL_WIDTH_COOKIE_NAME,
	RAIL_WIDTH_MAX,
	RAIL_WIDTH_MIN,
	railDirection,
	railStateCookie,
	railWidthCookie,
	readRailState,
	readRailWidth,
	resolveRailDrag,
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

describe("rail width", () => {
	test("clamps to the allowed range and rounds", () => {
		expect(clampRailWidth(100)).toBe(RAIL_WIDTH_MIN);
		expect(clampRailWidth(9999)).toBe(RAIL_WIDTH_MAX);
		expect(clampRailWidth(300.6)).toBe(301);
	});

	test("reads the cookie, clamped, and ignores garbage", () => {
		expect(readRailWidth(`theme=dark; ${RAIL_WIDTH_COOKIE_NAME}=312`)).toBe(
			312,
		);
		expect(readRailWidth(`${RAIL_WIDTH_COOKIE_NAME}=5000`)).toBe(
			RAIL_WIDTH_MAX,
		);
		expect(readRailWidth(`${RAIL_WIDTH_COOKIE_NAME}=wide`)).toBeNull();
		expect(readRailWidth("theme=dark")).toBeNull();
		expect(readRailWidth(undefined)).toBeNull();
	});

	test("writes a cookie the reader round-trips", () => {
		const cookie = railWidthCookie(333.3);
		expect(cookie).toContain(`${RAIL_WIDTH_COOKIE_NAME}=333;`);
		expect(readRailWidth(cookie)).toBe(333);
	});
});

describe("resolveRailDrag", () => {
	test("snaps shut below the threshold", () => {
		expect(resolveRailDrag(RAIL_COLLAPSE_THRESHOLD - 1)).toEqual({
			state: "collapsed",
		});
		expect(resolveRailDrag(-40)).toEqual({ state: "collapsed" });
	});

	test("between the threshold and the minimum it holds the minimum", () => {
		expect(resolveRailDrag(RAIL_COLLAPSE_THRESHOLD)).toEqual({
			state: "expanded",
			width: RAIL_WIDTH_MIN,
		});
	});

	test("follows the pointer inside the range and clamps past the max", () => {
		expect(resolveRailDrag(300)).toEqual({ state: "expanded", width: 300 });
		expect(resolveRailDrag(2000)).toEqual({
			state: "expanded",
			width: RAIL_WIDTH_MAX,
		});
	});
});
