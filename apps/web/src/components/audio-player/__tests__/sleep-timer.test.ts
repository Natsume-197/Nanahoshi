import { describe, expect, it } from "bun:test";
import {
	chapterSecondsRemaining,
	createSleepTimer,
	extendSleepTimer,
	SLEEP_FADE_SECONDS,
	sleepFadeFactor,
	tickSleepTimer,
} from "../sleep-timer";

const chapters = [
	{ startTime: 0, endTime: 600 },
	{ startTime: 600, endTime: 1500 },
	{ startTime: 1500, endTime: 2400 },
];

const ctx = (globalTime: number, speed = 1) => ({
	chapters,
	globalTime,
	totalDuration: 2400,
	speed,
});

describe("chapterSecondsRemaining", () => {
	it("measures to the end of the containing chapter", () => {
		expect(chapterSecondsRemaining(chapters, 700, 2400)).toBe(800);
	});

	it("falls back to the end of the book without chapters", () => {
		expect(chapterSecondsRemaining([], 900, 2400)).toBe(1500);
	});

	it("falls back to the end of the book past the last chapter", () => {
		expect(chapterSecondsRemaining(chapters, 2450, 2400)).toBe(0);
	});
});

describe("createSleepTimer", () => {
	it("starts a duration timer at its full length", () => {
		const timer = createSleepTimer({ kind: "duration", minutes: 15 }, ctx(0));
		expect(timer.remaining).toBe(900);
	});

	it("targets the end of the current chapter", () => {
		const timer = createSleepTimer({ kind: "chapter" }, ctx(700));
		expect(timer.remaining).toBe(800);
	});
});

describe("tickSleepTimer", () => {
	it("counts a duration timer down", () => {
		const timer = createSleepTimer({ kind: "duration", minutes: 1 }, ctx(0));
		const tick = tickSleepTimer(timer, 10, ctx(10));
		expect(tick.expired).toBe(false);
		expect(tick.state?.remaining).toBe(50);
	});

	it("fires once a duration timer runs out", () => {
		const tick = tickSleepTimer(
			{ mode: { kind: "duration", minutes: 1 }, remaining: 1 },
			1,
			ctx(60),
		);
		expect(tick).toEqual({ state: null, expired: true });
	});

	it("re-targets a chapter timer after a seek instead of counting blindly", () => {
		const timer = createSleepTimer({ kind: "chapter" }, ctx(700));
		// The reader jumps back into chapter 1 — the timer follows the playhead.
		const tick = tickSleepTimer(timer, 1, ctx(100));
		expect(tick.state?.remaining).toBe(500);
	});

	it("shortens a chapter timer by the playback rate", () => {
		const timer = createSleepTimer({ kind: "chapter" }, ctx(600));
		const tick = tickSleepTimer(timer, 1, ctx(600, 2));
		expect(tick.state?.remaining).toBe(450);
	});

	it("fires at the end of the chapter", () => {
		const tick = tickSleepTimer(
			{ mode: { kind: "chapter" }, remaining: 1 },
			1,
			ctx(1499.8),
		);
		expect(tick).toEqual({ state: null, expired: true });
	});

	it("is inert with no timer set", () => {
		expect(tickSleepTimer(null, 1, ctx(0))).toEqual({
			state: null,
			expired: false,
		});
	});
});

describe("extendSleepTimer", () => {
	it("adds time and unpins a chapter timer", () => {
		const extended = extendSleepTimer(
			{ mode: { kind: "chapter" }, remaining: 100 },
			300,
		);
		expect(extended?.remaining).toBe(400);
		expect(extended?.mode.kind).toBe("duration");
	});

	it("does nothing without a timer", () => {
		expect(extendSleepTimer(null)).toBeNull();
	});
});

describe("sleepFadeFactor", () => {
	it("keeps full volume outside the fade window", () => {
		expect(sleepFadeFactor(SLEEP_FADE_SECONDS + 1)).toBe(1);
	});

	it("ramps linearly through the fade window", () => {
		expect(sleepFadeFactor(10, 20)).toBe(0.5);
		expect(sleepFadeFactor(0, 20)).toBe(0);
	});
});
