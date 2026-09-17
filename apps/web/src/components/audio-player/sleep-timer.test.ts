import { describe, expect, test } from "bun:test";
import { createSleepTimer, tickSleepTimer } from "./sleep-timer";

describe("sleep timer book-end mode", () => {
	test("creates remaining time until the end of the book", () => {
		const state = createSleepTimer(
			{ kind: "book-end" },
			{ chapters: [], globalTime: 100, totalDuration: 1000 },
		);
		expect(state.remaining).toBe(900);
	});

	test("ticks down with playback speed applied", () => {
		const state = createSleepTimer(
			{ kind: "book-end" },
			{ chapters: [], globalTime: 0, totalDuration: 100 },
		);
		const ticked = tickSleepTimer(state, 1, {
			chapters: [],
			globalTime: 50,
			totalDuration: 100,
			speed: 2,
		});
		expect(ticked.expired).toBe(false);
		expect(ticked.state?.remaining).toBe(25);
	});

	test("expires at the end of the book", () => {
		const state = createSleepTimer(
			{ kind: "book-end" },
			{ chapters: [], globalTime: 0, totalDuration: 100 },
		);
		const ticked = tickSleepTimer(state, 1, {
			chapters: [],
			globalTime: 100,
			totalDuration: 100,
			speed: 1,
		});
		expect(ticked.expired).toBe(true);
		expect(ticked.state).toBeNull();
	});
});
