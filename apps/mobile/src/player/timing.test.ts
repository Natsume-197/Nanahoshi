import { describe, expect, test } from "bun:test";
import {
	clockIn,
	extendSleep,
	findNextInSeries,
	normalizeJumpAmount,
	nudgeSpeed,
	positionsInSpan,
	progressReadout,
	realTimeAt,
	sleepFadeFactor,
	smartRewind,
} from "./timing";

test("speed steps by a tenth and stays within 0.5×–5×", () => {
	expect(nudgeSpeed(1, 1)).toBe(1.1);
	expect(nudgeSpeed(1.25, -1)).toBe(1.2);
	expect(nudgeSpeed(0.5, -1)).toBe(0.5);
	expect(nudgeSpeed(5, 1)).toBe(5);
});

test("a stored jump amount outside the choices falls back", () => {
	expect(normalizeJumpAmount("15", 10)).toBe(15);
	expect(normalizeJumpAmount("7", 10)).toBe(10);
	expect(normalizeJumpAmount(null, 30)).toBe(30);
});

test("extending any timer makes it a countdown five minutes longer", () => {
	expect(extendSleep(90)).toEqual({
		mode: { kind: "duration", minutes: 6.5 },
		remaining: 390,
	});
});

test("the last twenty seconds of a sleep timer fade out", () => {
	expect(sleepFadeFactor(60)).toBe(1);
	expect(sleepFadeFactor(10)).toBe(0.5);
	expect(sleepFadeFactor(-1)).toBe(0);
});

test("chapter scope narrows the bar to the playing chapter", () => {
	const chapter = { startTime: 100, endTime: 400 };
	expect(progressReadout("chapter", 250, 1000, chapter)).toEqual({
		start: 100,
		end: 400,
		total: 300,
		elapsed: 150,
		remaining: 150,
	});
	expect(progressReadout("book", 250, 1000, chapter).remaining).toBe(750);
	// No chapter to narrow to: the whole book.
	expect(progressReadout("chapter", 250, 1000, undefined).end).toBe(1000);
});

test("time left is wall-clock time at the current speed", () => {
	expect(realTimeAt(300, 1.5)).toBe(200);
});

test("the next book is the one after it in the series order", () => {
	const books = [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }];
	expect(findNextInSeries("a", books)?.uuid).toBe("b");
	expect(findNextInSeries("c", books)).toBeNull();
	expect(findNextInSeries("x", books)).toBeNull();
});

test("bookmarks mark the chapter bar only inside that chapter", () => {
	expect(positionsInSpan([50, 150, 200, 260], 100, 200)).toEqual([0.5, 1]);
	expect(positionsInSpan([10], 0, 0)).toEqual([]);
});

describe("clockIn", () => {
	const chapters = [
		{ index: 0, title: "a", startTime: 0, endTime: 100 },
		{ index: 1, title: "b", startTime: 100, endTime: 400 },
	];

	test("counts from the chapter start in chapter scope, like the seek bar", () => {
		expect(clockIn(chapters, 130, "chapter")).toBe("0:30");
	});

	test("counts from the book start in book scope", () => {
		expect(clockIn(chapters, 130, "book")).toBe("2:10");
	});

	test("falls back to the book clock without chapters", () => {
		expect(clockIn([], 130, "chapter")).toBe("2:10");
	});
});

describe("smartRewind", () => {
	const minutes = (n: number) => n * 60_000;

	test("resumes in place after a short pause", () => {
		expect(smartRewind(minutes(9), 500)).toBe(0);
	});

	test("backs up 10 s after ten minutes, 30 s after an hour", () => {
		expect(smartRewind(minutes(10), 500)).toBe(10);
		expect(smartRewind(minutes(60), 500)).toBe(30);
	});

	test("never rewinds past the start", () => {
		expect(smartRewind(minutes(90), 12)).toBe(12);
		expect(smartRewind(minutes(90), 0)).toBe(0);
	});
});
