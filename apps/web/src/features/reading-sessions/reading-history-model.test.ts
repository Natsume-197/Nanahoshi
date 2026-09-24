import { expect, test } from "bun:test";
import {
	addDays,
	chapterAt,
	chapterLeft,
	chartSlots,
	daysToFinish,
	defaultPeriod,
	displaySpeed,
	finishInDays,
	formatClock,
	goalStatus,
	goalTimeline,
	groupByWeek,
	type HistoryDay,
	listeningScale,
	mergeRanges,
	niceMaximum,
	paceChange,
	paceDomain,
	paceTrend,
	parseClock,
	progressAmount,
	readerChapters,
	readingDay,
	readingScale,
	readRanges,
	rowSpeed,
	runSummary,
	streaks,
	timeFor,
	todayVersusAverage,
	weekStart,
	withProjection,
} from "./reading-history-model";

function day(overrides: Partial<HistoryDay> & { day: string }): HistoryDay {
	return {
		seconds: 600,
		observedSeconds: 600,
		progress: 0.01,
		manualProgress: 0,
		startPosition: 0.1,
		endPosition: 0.11,
		...overrides,
	};
}

test("books without a character count fall back to percentage points", () => {
	expect(readingScale(120_000).unit).toBe("chars");
	expect(readingScale(null).unit).toBe("percent");
	expect(readingScale(0).unit).toBe("percent");
	expect(progressAmount(0.05, readingScale(200_000))).toBe(10_000);
	expect(progressAmount(0.05, readingScale(null))).toBeCloseTo(5);
});

test("speed converts book fraction per second into characters per hour", () => {
	expect(displaySpeed(0.02 / 600, readingScale(300_000))).toBe(36_000);
	expect(displaySpeed(0.02 / 600, readingScale(null))).toBeCloseTo(12);
	expect(displaySpeed(null, readingScale(300_000))).toBeNull();
});

test("audiobooks measure progress in audio seconds and speed as a multiple", () => {
	const scale = listeningScale(36_000);
	expect(scale.unit).toBe("audio");
	expect(listeningScale(null).unit).toBe("percent");
	expect(progressAmount(0.05, scale)).toBe(1_800);
	// 1.5 minutes of audio per real minute.
	expect(displaySpeed(1.5 / 36_000, scale)).toBeCloseTo(1.5);
	expect(rowSpeed(0.025, 600, scale)).toBeCloseTo(1.5);
});

test("days to finish uses the average reading day", () => {
	expect(daysToFinish(3600, 3600, 3)).toBe(3);
	expect(daysToFinish(60, 3600, 1)).toBe(1);
	expect(daysToFinish(null, 3600, 3)).toBeNull();
	expect(daysToFinish(3600, 0, 0)).toBeNull();
});

test("addDays crosses month and year boundaries", () => {
	expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
	expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
});

test("default period is the last month only while it has activity", () => {
	expect(defaultPeriod([day({ day: "2026-09-20" })], "2026-09-23")).toBe(
		"month",
	);
	expect(defaultPeriod([day({ day: "2026-06-01" })], "2026-09-23")).toBe("all");
	expect(defaultPeriod([], "2026-09-23")).toBe("all");
});

test("week slots fill idle days and carry the position forward", () => {
	const slots = chartSlots(
		[
			day({ day: "2026-09-10", endPosition: 0.3 }),
			day({ day: "2026-09-20", endPosition: 0.4, progress: 0.1 }),
		],
		"week",
		"2026-09-23",
		readingScale(100_000),
	);
	expect(slots.map((s) => s.day)).toEqual([
		"2026-09-17",
		"2026-09-18",
		"2026-09-19",
		"2026-09-20",
		"2026-09-21",
		"2026-09-22",
		"2026-09-23",
	]);
	expect(slots[0]?.position).toBe(0.3);
	expect(slots[3]).toMatchObject({ amount: 10_000, read: true, position: 0.4 });
	expect(slots[6]).toMatchObject({ amount: 0, read: false, position: 0.4 });
});

test("all-time slots collapse to reading days when the span is too long", () => {
	const short = chartSlots(
		[day({ day: "2026-09-01" }), day({ day: "2026-09-05" })],
		"all",
		"2026-09-23",
		readingScale(null),
	);
	expect(short).toHaveLength(5);
	const long = chartSlots(
		[day({ day: "2025-01-01" }), day({ day: "2026-09-05" })],
		"all",
		"2026-09-23",
		readingScale(null),
	);
	expect(long.map((s) => s.day)).toEqual(["2025-01-01", "2026-09-05"]);
});

test("nice maximum rounds to readable steps", () => {
	expect(niceMaximum(0)).toBe(1);
	expect(niceMaximum(7_300)).toBe(10_000);
	expect(niceMaximum(2_100)).toBe(2_500);
	expect(niceMaximum(3.2)).toBe(5);
});

test("today is compared against earlier reading days only", () => {
	const days = [
		day({ day: "2026-09-20", progress: 0.02 }),
		day({ day: "2026-09-21", progress: 0.04 }),
		day({ day: "2026-09-23", progress: 0.06 }),
	];
	expect(todayVersusAverage(days, "2026-09-23", readingScale(100_000))).toEqual(
		{
			amount: 6_000,
			average: 3_000,
			ahead: 100,
		},
	);
	expect(
		todayVersusAverage(days, "2026-09-24", readingScale(100_000)),
	).toMatchObject({
		amount: 0,
		ahead: null,
	});
	expect(
		todayVersusAverage(
			[days[2] as HistoryDay],
			"2026-09-23",
			readingScale(null),
		),
	).toMatchObject({ average: null, ahead: null });
});

test("manual portions of a day are split out of the slot", () => {
	const [slot] = chartSlots(
		[
			day({
				day: "2026-09-23",
				seconds: 900,
				observedSeconds: 600,
				progress: 0.03,
				manualProgress: 0.01,
			}),
		],
		"all",
		"2026-09-23",
		readingScale(100_000),
	);
	expect(slot).toMatchObject({ manualSeconds: 300, manualAmount: 1_000 });
});

test("run summary spans first to last reading day", () => {
	expect(
		runSummary([
			day({ day: "2026-09-03", seconds: 100 }),
			day({ day: "2026-09-19", seconds: 200 }),
		]),
	).toEqual({
		first: "2026-09-03",
		last: "2026-09-19",
		readingDays: 2,
		seconds: 300,
	});
	expect(runSummary([])).toBeNull();
});

test("finish estimate falls back to the average daily advance", () => {
	const days = [
		day({ day: "2026-09-20", progress: 0.1 }),
		day({ day: "2026-09-21", progress: 0.1 }),
		day({ day: "2026-09-22", progress: 0.1 }),
	];
	const base = { remainingSeconds: null, totalSeconds: 1800, days };
	expect(finishInDays({ ...base, position: 0.7 })).toBe(3);
	expect(finishInDays({ ...base, position: 1 })).toBeNull();
	expect(
		finishInDays({ ...base, days: days.slice(0, 2), position: 0.7 }),
	).toBeNull();
	expect(finishInDays({ ...base, remainingSeconds: 1200, position: 0.7 })).toBe(
		2,
	);
});

test("projection appends future days up to a share of the window", () => {
	const slots = chartSlots(
		[
			day({ day: "2026-09-10", endPosition: 0.2 }),
			day({ day: "2026-09-23", endPosition: 0.5 }),
		],
		"week",
		"2026-09-23",
		readingScale(null),
	);
	const near = withProjection(slots, 2, "2026-09-23");
	expect(near.slots).toHaveLength(9);
	expect(near.slots.at(-1)).toMatchObject({ day: "2026-09-25", future: true });
	expect(near.projection).toEqual({
		fromIndex: 6,
		fromPosition: 0.5,
		targetIndex: 8,
		finishDay: "2026-09-25",
	});
	const far = withProjection(slots, 40, "2026-09-23");
	expect(far.slots).toHaveLength(10);
	expect(far.projection?.targetIndex).toBe(46);
	expect(withProjection(slots, null, "2026-09-23").projection).toBeNull();
	expect(withProjection(slots, 2, "2026-09-24").projection).toBeNull();
});

test("all-time slots can stretch to today for in-progress books", () => {
	const slots = chartSlots(
		[day({ day: "2026-09-20" })],
		"all",
		"2026-09-23",
		readingScale(null),
		true,
	);
	expect(slots.at(-1)?.day).toBe("2026-09-23");
});

test("pace trend and change resist a single outlier", () => {
	expect(paceTrend([1, 1, 9, 1, 1])).toEqual([1, 1, 1, 1, 1]);
	expect(paceChange([10, 10, 10, 12, 12, 12])).toBe(20);
	expect(paceChange([10, 10, 10, 12, 12])).toBeNull();
});

test("month window starts at the first reading day when it began inside it", () => {
	const slots = chartSlots(
		[day({ day: "2026-09-20" })],
		"month",
		"2026-09-23",
		readingScale(null),
	);
	expect(slots.map((s) => s.day)).toEqual([
		"2026-09-20",
		"2026-09-21",
		"2026-09-22",
		"2026-09-23",
	]);
});

test("pace domain hugs the data instead of starting at zero", () => {
	expect(paceDomain([5_400, 7_900])).toEqual({
		low: 2_500,
		high: 10_000,
		ticks: [2_500, 5_000, 7_500, 10_000],
	});
	expect(paceDomain([100, 100])).toMatchObject({ low: 50, high: 200 });
});

test("weeks start on Monday and group consecutive days", () => {
	expect(weekStart("2026-09-23")).toBe("2026-09-21");
	expect(weekStart("2026-09-21")).toBe("2026-09-21");
	expect(weekStart("2026-09-20")).toBe("2026-09-14");
	const weeks = groupByWeek([
		{ day: "2026-09-23" },
		{ day: "2026-09-21" },
		{ day: "2026-09-20" },
	]);
	expect(weeks.map((w) => [w.start, w.days.length])).toEqual([
		["2026-09-21", 2],
		["2026-09-14", 1],
	]);
});

test("row speed needs a minute of reading and some progress", () => {
	expect(rowSpeed(0.01, 600, readingScale(360_000))).toBe(21_600);
	expect(rowSpeed(0.01, 30, readingScale(360_000))).toBeNull();
	expect(rowSpeed(0, 600, readingScale(360_000))).toBeNull();
});

test("read ranges drop jumps and backward moves and sort by start", () => {
	expect(
		readRanges([
			{ start: 0.5, end: 0.6, kind: "reading" },
			{ start: 0.6, end: 0.2, kind: "jump" },
			{ start: 0.2, end: 0.25, kind: "manual" },
			{ start: 0.3, end: 0.28, kind: "reading" },
			{ start: null, end: 0.4, kind: "reading" },
		]),
	).toEqual([
		{ start: 0.2, end: 0.25, manual: true },
		{ start: 0.5, end: 0.6, manual: false },
	]);
});

test("merge joins touching chunks and records overlapping rereads", () => {
	const { spans, rereads } = mergeRanges([
		{ start: 0.1, end: 0.12, manual: false },
		{ start: 0.12, end: 0.15, manual: false },
		{ start: 0.14, end: 0.16, manual: false },
		{ start: 0.4, end: 0.45, manual: true },
	]);
	expect(spans).toEqual([
		{ start: 0.1, end: 0.16, manual: false },
		{ start: 0.4, end: 0.45, manual: true },
	]);
	expect(rereads).toHaveLength(1);
	expect(rereads[0]?.start).toBeCloseTo(0.14);
	expect(rereads[0]?.end).toBeCloseTo(0.15);
});

test("goal spreads what is left over the days until the goal, today included", () => {
	const status = goalStatus({
		goalDate: "2026-09-25",
		today: "2026-09-23",
		position: 0.7,
		days: [day({ day: "2026-09-23", progress: 0.05 })],
		finishIn: 2,
		finishedOn: null,
	});
	expect(status?.kind).toBe("active");
	if (status?.kind !== "active") return;
	expect(status.daysLeft).toBe(3);
	expect(status.perDay).toBeCloseTo(0.35 / 3);
	expect(status.todayLeft).toBeCloseTo(0.35 / 3 - 0.05);
	expect(status.lateBy).toBe(0);
});

test("goal reports lateness, overdue and the outcome of a finished reading", () => {
	const base = {
		today: "2026-09-23",
		position: 0.5,
		days: [],
		finishedOn: null,
	};
	const late = goalStatus({ ...base, goalDate: "2026-09-24", finishIn: 5 });
	expect(late?.kind === "active" && late.lateBy).toBe(4);
	expect(goalStatus({ ...base, goalDate: "2026-09-22", finishIn: 1 })).toEqual({
		kind: "overdue",
	});
	expect(
		goalStatus({
			...base,
			goalDate: "2026-09-25",
			finishIn: null,
			finishedOn: "2026-09-22",
		}),
	).toEqual({ kind: "met", daysEarly: 3 });
	expect(
		goalStatus({
			...base,
			goalDate: "2026-09-20",
			finishIn: null,
			finishedOn: "2026-09-22",
		}),
	).toEqual({ kind: "missed", daysLate: 2 });
	expect(goalStatus({ ...base, goalDate: null, finishIn: null })).toBeNull();
});

test("goal timeline spans the reading up to the later of goal and finish", () => {
	expect(
		goalTimeline({
			start: "2026-09-01",
			today: "2026-09-11",
			goalDay: "2026-09-21",
			finishDay: "2026-10-01",
		}),
	).toEqual({ today: 1 / 3, goal: 2 / 3, finish: 1, late: true });
	expect(
		goalTimeline({
			start: "2026-09-01",
			today: "2026-09-11",
			goalDay: "2026-09-21",
			finishDay: "2026-09-16",
		}),
	).toEqual({ today: 0.5, goal: 1, finish: 0.75, late: false });
	expect(
		goalTimeline({
			start: "2026-09-01",
			today: "2026-09-11",
			goalDay: "2026-09-21",
			finishDay: null,
		}),
	).toMatchObject({ finish: null, late: null, goal: 1 });
});

test("streaks count consecutive active days and survive until today ends", () => {
	const days = [
		"2026-09-01",
		"2026-09-02",
		"2026-09-03",
		"2026-09-10",
		"2026-09-11",
	].map((d) => day({ day: d }));
	expect(streaks(days, "2026-09-12")).toEqual({ current: 2, best: 3 });
	expect(streaks(days, "2026-09-11")).toEqual({ current: 2, best: 3 });
	expect(streaks(days, "2026-09-13")).toEqual({ current: 0, best: 3 });
	expect(
		streaks([day({ day: "2026-09-11", seconds: 0 })], "2026-09-11"),
	).toEqual({
		current: 0,
		best: 0,
	});
	expect(streaks([], "2026-09-11")).toEqual({ current: 0, best: 0 });
});

test("audio clock and chapter lookup", () => {
	expect(formatClock(59.9)).toBe("0:59");
	expect(formatClock(3130)).toBe("52:10");
	expect(formatClock(17530)).toBe("4:52:10");
	const chapters = [0, 600, 1800].map((t) => ({
		title: null,
		start: t / 3600,
	}));
	expect(chapterAt(chapters, 0)).toBe(1);
	expect(chapterAt(chapters, 600 / 3600)).toBe(2);
	expect(chapterAt(chapters, 0.99)).toBe(3);
	expect(chapterAt([], 0.5)).toBeNull();
	expect(chapterAt([{ title: null, start: 0.1 }], 0.05)).toBeNull();
});

test("reader chapters keep labelled top-level sections as book fractions", () => {
	expect(
		readerChapters(
			[
				{ startCharacter: 0 },
				{ label: " 第一章 ", startCharacter: 100 },
				{ label: "節", startCharacter: 150, parentChapter: "c1" },
				{ label: "第二章", startCharacter: 600 },
				{ label: "目次" },
			],
			1000,
		),
	).toEqual([
		{ title: "第一章", start: 0.1 },
		{ title: "第二章", start: 0.6 },
	]);
	expect(readerChapters([{ startCharacter: 0 }], 1000)).toBeNull();
	expect(readerChapters([{ label: "a", startCharacter: 0 }], 0)).toBeNull();
});
test("matching the average up to rounding is not reported as 0 % more", () => {
	const days = [
		day({ day: "2026-09-22", progress: 0.03 }),
		day({ day: "2026-09-23", progress: 0.03001 }),
	];
	expect(
		todayVersusAverage(days, "2026-09-23", readingScale(100_000)).ahead,
	).toBeNull();
});

test("audio clock text parses back to seconds", () => {
	expect(parseClock("4:52:10")).toBe(17530);
	expect(parseClock(" 52:10 ")).toBe(3130);
	expect(parseClock("75:00")).toBe(4500);
	expect(parseClock(formatClock(17530))).toBe(17530);
	for (const bad of ["", "52", "1:60", "1:61:00", "a:10", "1:2:3:4"])
		expect(parseClock(bad)).toBeNull();
});

test("listening compares today's real time with earlier days", () => {
	const days = [
		day({ day: "2026-09-22", seconds: 1200, progress: 0.5 }),
		day({ day: "2026-09-23", seconds: 1800, progress: 0.01 }),
	];
	expect(
		todayVersusAverage(days, "2026-09-23", readingScale(null), "time"),
	).toEqual({ amount: 1800, average: 1200, ahead: 50 });
});

test("reader chapters skip tiny front matter but keep short chapters later on", () => {
	const sections = [
		{ label: "表紙", startCharacter: 0 },
		{ label: "目次", startCharacter: 2 },
		{ label: "一章", startCharacter: 40 },
		{ label: "幕間", startCharacter: 5000 },
		{ label: "二章", startCharacter: 5050 },
	];
	expect(readerChapters(sections, 10_000)?.map((c) => c.title)).toEqual([
		"一章",
		"幕間",
		"二章",
	]);
});

test("the reading day can start after midnight", () => {
	const lateNight = Date.parse("2026-01-03T06:30:00Z"); // 01:30 in Bogotá
	expect(readingDay(lateNight, "America/Bogota")).toBe("2026-01-03");
	expect(readingDay(lateNight, "America/Bogota", 4)).toBe("2026-01-02");
});

test("chapter time left runs to the next chapter or the end", () => {
	const chapters = [0.1, 0.4, 0.8].map((start) => ({ title: null, start }));
	expect(chapterLeft(chapters, 0.3)).toBeCloseTo(0.1);
	expect(chapterLeft(chapters, 0.9)).toBeCloseTo(0.1);
	expect(chapterLeft(chapters, 0.05)).toBeNull();
	expect(timeFor(0.01, 0.01 / 600)).toBeCloseTo(600);
	expect(timeFor(0.01, null)).toBeNull();
});
