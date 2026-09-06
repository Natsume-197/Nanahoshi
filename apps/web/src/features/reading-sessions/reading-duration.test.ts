import { expect, test } from "bun:test";
import { sessionDuration } from "./reading-duration";

test("session duration retains hours, minutes and seconds without wrapping hours", () => {
	expect(sessionDuration(0)).toBe("00:00:00");
	expect(sessionDuration(59.9)).toBe("00:00:59");
	expect(sessionDuration(60)).toBe("00:01:00");
	expect(sessionDuration(3661)).toBe("01:01:01");
	expect(sessionDuration(360000)).toBe("100:00:00");
});
