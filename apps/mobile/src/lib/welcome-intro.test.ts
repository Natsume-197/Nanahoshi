import { describe, expect, it } from "bun:test";
import { LAST_SLIDE, skipIntro, slideAt } from "./welcome-intro";

describe("skipIntro", () => {
	it("tells the story the first time", () => {
		expect(skipIntro({ seen: false, justConnected: false })).toBe(false);
	});

	it("goes straight to sign-in once the story was seen", () => {
		expect(skipIntro({ seen: true, justConnected: false })).toBe(true);
	});

	it("goes straight to sign-in right after picking a server", () => {
		expect(skipIntro({ seen: false, justConnected: true })).toBe(true);
	});
});

describe("slideAt", () => {
	it("rounds a resting offset to its page and clamps overscroll", () => {
		expect(slideAt(390 * 1.4, 390)).toBe(1);
		expect(slideAt(-40, 390)).toBe(0);
		expect(slideAt(390 * 9, 390)).toBe(LAST_SLIDE);
	});
});
