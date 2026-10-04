import { expect, test } from "bun:test";
import { parseServerTime } from "./server-time";

const at = Date.UTC(2026, 8, 30, 22, 49, 32, 77);

test("reads Postgres' text timestamps", () => {
	expect(parseServerTime("2026-09-30 22:49:32.077+00")).toBe(at);
	expect(parseServerTime("2026-10-01 00:49:32.077+02")).toBe(at);
});

test("reads ISO strings and dates", () => {
	expect(parseServerTime("2026-09-30T22:49:32.077Z")).toBe(at);
	expect(parseServerTime(new Date(at))).toBe(at);
});

test("gives null for missing or unreadable values", () => {
	expect(parseServerTime(null)).toBeNull();
	expect(parseServerTime("soon")).toBeNull();
});
