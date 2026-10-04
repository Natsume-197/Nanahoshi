import { expect, test } from "bun:test";
import {
	clockParts,
	readingDuration,
	sessionDuration,
	shortDuration,
} from "./reading-duration";

test("session duration retains hours, minutes and seconds without wrapping hours", () => {
	expect(sessionDuration(0)).toBe("00:00:00");
	expect(sessionDuration(59.9)).toBe("00:00:59");
	expect(sessionDuration(60)).toBe("00:01:00");
	expect(sessionDuration(3661)).toBe("01:01:01");
	expect(sessionDuration(360000)).toBe("100:00:00");
});

test("reading duration drops zero minutes on whole hours", () => {
	expect(readingDuration(59)).toBe("0 min");
	expect(readingDuration(3600)).toBe("1 h");
	expect(readingDuration(3660)).toBe("1 h 1 min");
	expect(readingDuration(7200)).toBe("2 h");
});

test("short duration drops the minutes unit so a calendar day fits it", () => {
	expect(shortDuration(14 * 60)).toBe("14 min");
	expect(shortDuration(96 * 60)).toBe("1 h 36");
	expect(shortDuration(65 * 60)).toBe("1 h 05");
	expect(shortDuration(7200)).toBe("2 h");
});

test("the live clock shows hours only once they exist", () => {
	expect(clockParts(0)).toEqual({ main: "0", seconds: ":00" });
	expect(clockParts(51.8)).toEqual({ main: "0", seconds: ":51" });
	expect(clockParts(12 * 60 + 5)).toEqual({ main: "12", seconds: ":05" });
	expect(clockParts(3725)).toEqual({ main: "1:02", seconds: ":05" });
});
