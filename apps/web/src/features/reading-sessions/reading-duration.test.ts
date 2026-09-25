import { expect, test } from "bun:test";
import {
	clockParts,
	readingDuration,
	sessionDuration,
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

test("the live clock shows hours only once they exist", () => {
	expect(clockParts(0)).toEqual({ main: "0", seconds: ":00" });
	expect(clockParts(51.8)).toEqual({ main: "0", seconds: ":51" });
	expect(clockParts(12 * 60 + 5)).toEqual({ main: "12", seconds: ":05" });
	expect(clockParts(3725)).toEqual({ main: "1:02", seconds: ":05" });
});
