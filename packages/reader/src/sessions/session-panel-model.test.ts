import { describe, expect, test } from "bun:test";
import { readingGoalProgress, sessionSpeed } from "./session-panel-model";

const goals = (
	reading: number | null,
	readingUnit: "characters" | "minutes" = "characters",
) => ({ readingUnit, reading, listeningMinutes: null });

describe("sessionSpeed", () => {
	test("waits for a minute of reading and some advance", () => {
		expect(sessionSpeed(500, 59)).toBeNull();
		expect(sessionSpeed(0, 600)).toBeNull();
		expect(sessionSpeed(null, 600)).toBeNull();
	});
	test("reports characters per hour", () => {
		expect(sessionSpeed(1000, 600)).toBe(6000);
	});
});

describe("readingGoalProgress", () => {
	test("is null without a reading goal", () => {
		expect(readingGoalProgress(undefined, null, null, 1000)).toBeNull();
		expect(readingGoalProgress(goals(null), null, null, 1000)).toBeNull();
	});
	test("counts characters and turns what is left into time at this book's pace", () => {
		// 0.001 of a 100 000 character book per second = 100 characters per second.
		const progress = readingGoalProgress(
			goals(5000),
			{ readingSeconds: 900, characters: 3000 },
			0.001,
			100_000,
		);
		expect(progress).toMatchObject({
			unit: "characters",
			done: 3000,
			remaining: 2000,
			ratio: 0.6,
			remainingSeconds: 20,
		});
	});
	test("cannot estimate a character goal without pace or length", () => {
		expect(
			readingGoalProgress(
				goals(5000),
				{ readingSeconds: 0, characters: 0 },
				null,
				100_000,
			)?.remainingSeconds,
		).toBeNull();
		expect(
			readingGoalProgress(goals(5000), null, 0.001, undefined)
				?.remainingSeconds,
		).toBeNull();
	});
	test("a minutes goal needs only the clock", () => {
		const progress = readingGoalProgress(
			goals(30, "minutes"),
			{ readingSeconds: 20 * 60 + 59, characters: 0 },
			null,
			null,
		);
		expect(progress).toMatchObject({
			done: 20,
			remaining: 10,
			remainingSeconds: 600,
		});
	});
	test("an exceeded goal keeps its ratio above one and nothing left", () => {
		const progress = readingGoalProgress(
			goals(1000),
			{ readingSeconds: 60, characters: 1500 },
			null,
			null,
		);
		expect(progress?.ratio).toBe(1.5);
		expect(progress?.remaining).toBe(0);
		expect(progress?.remainingSeconds).toBe(0);
	});
});
