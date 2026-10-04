import { expect, test } from "bun:test";
import {
	averageChange,
	bookShares,
	dayQualifies,
	fastestFinish,
	goalRatios,
	goalStreaks,
	heatmap,
	hoursFor,
	mondayOf,
	mostCharactersDay,
	paceOf,
	paceSeries,
	peakPart,
	peakWeekday,
	periodCount,
	periodRange,
	periodSeries,
	periodSummary,
	type StatsDay,
	type StatsGoals,
	typicalDay,
	weekGrid,
} from "./stats-model";

function day(date: string, overrides: Partial<StatsDay> = {}): StatsDay {
	return {
		day: date,
		readingSeconds: 0,
		listeningSeconds: 0,
		totalSeconds: 0,
		characters: 0,
		readingSessions: 0,
		listeningSessions: 0,
		finishedReading: 0,
		finishedListening: 0,
		speedSeconds: 0,
		speedCharacters: 0,
		...overrides,
	};
}
const noGoals: StatsGoals = {
	readingUnit: "characters",
	reading: null,
	listeningMinutes: null,
};

test("goal ratios follow the chosen reading unit and stay null when unset", () => {
	const d = day("2026-09-24", {
		characters: 2500,
		readingSeconds: 900,
		listeningSeconds: 1800,
	});
	expect(goalRatios(d, { ...noGoals, reading: 5000 })).toEqual({
		reading: 0.5,
		listening: null,
	});
	expect(
		goalRatios(d, {
			readingUnit: "minutes",
			reading: 30,
			listeningMinutes: 15,
		}),
	).toEqual({ reading: 0.5, listening: 2 });
});

test("the all view counts a day when either goal closes; without goals activity counts", () => {
	const goals: StatsGoals = {
		readingUnit: "minutes",
		reading: 10,
		listeningMinutes: 10,
	};
	const onlyRead = day("2026-09-24", {
		readingSeconds: 600,
		totalSeconds: 600,
	});
	expect(dayQualifies(onlyRead, "reading", goals)).toBe(true);
	expect(dayQualifies(onlyRead, "all", goals)).toBe(true);
	expect(dayQualifies(onlyRead, "listening", goals)).toBe(false);
	expect(dayQualifies(onlyRead, "listening", noGoals)).toBe(false);
	expect(dayQualifies(onlyRead, "all", noGoals)).toBe(true);
});

test("streaks count goal days and stay alive through today", () => {
	const goals = { ...noGoals, reading: 100 };
	const days = [
		day("2026-09-20", { characters: 200, readingSeconds: 60 }),
		day("2026-09-21", { characters: 50, readingSeconds: 60 }),
		day("2026-09-22", { characters: 150, readingSeconds: 60 }),
		day("2026-09-23", { characters: 150, readingSeconds: 60 }),
	];
	expect(goalStreaks(days, "2026-09-24", "reading", goals)).toEqual({
		current: 2,
		best: 2,
		metDays: 3,
	});
	expect(goalStreaks(days, "2026-09-24", "reading", noGoals).current).toBe(4);
});

test("weeks start on Monday and months and years page backwards", () => {
	expect(mondayOf("2026-09-24")).toBe("2026-09-21");
	expect(mondayOf("2026-09-21")).toBe("2026-09-21");
	expect(mondayOf("2026-09-27")).toBe("2026-09-21");
	const lastWeek = periodRange("week", "2026-09-24", 1);
	expect([lastWeek.from, lastWeek.to]).toEqual(["2026-09-14", "2026-09-20"]);
	const january = periodRange("month", "2026-03-10", 2);
	expect([january.from, january.to, january.buckets.length]).toEqual([
		"2026-01-01",
		"2026-01-31",
		31,
	]);
	const december = periodRange("month", "2026-01-10", 1);
	expect(december.from).toBe("2025-12-01");
	const year = periodRange("year", "2026-09-24");
	expect(year.buckets.map((b) => b.key).slice(0, 2)).toEqual([
		"2026-01",
		"2026-02",
	]);
	expect(year.buckets[1]?.to).toBe("2026-02-28");
});

test("paging stops at the first recorded period", () => {
	expect(periodCount("week", undefined, "2026-09-24")).toBe(1);
	expect(periodCount("week", "2026-09-22", "2026-09-24")).toBe(1);
	expect(periodCount("week", "2026-09-10", "2026-09-24")).toBe(3);
	expect(periodCount("year", "2024-12-31", "2026-09-24")).toBe(3);
});

test("series sum months for a year and never count the future", () => {
	const days = [
		day("2026-01-05", { readingSeconds: 60, totalSeconds: 60 }),
		day("2026-01-06", {
			readingSeconds: 60,
			listeningSeconds: 120,
			totalSeconds: 150,
		}),
	];
	const points = periodSeries(
		days,
		periodRange("year", "2026-09-24"),
		"2026-09-24",
	);
	expect(points[0]).toMatchObject({ reading: 120, listening: 120, total: 210 });
	expect(points[9]?.future).toBe(true);
});

test("a period in progress averages only the days lived so far", () => {
	const days = [
		day("2026-09-21", {
			readingSeconds: 600,
			totalSeconds: 600,
			characters: 900,
		}),
		day("2026-09-23", {
			listeningSeconds: 1200,
			totalSeconds: 1200,
			finishedListening: 1,
		}),
	];
	const range = periodRange("week", "2026-09-24");
	expect(periodSummary(days, range, "2026-09-24", "all")).toEqual({
		seconds: 1800,
		characters: 900,
		finished: 1,
		activeDays: 2,
		elapsedDays: 4,
		dailyAverage: 450,
	});
	expect(periodSummary(days, range, "2026-09-24", "listening").characters).toBe(
		0,
	);
	expect(averageChange(450, 300)).toBe(0.5);
	expect(averageChange(450, 0)).toBeNull();
});

test("heatmap ends on today's week and ranks days by quartile", () => {
	const days = [10, 20, 30, 40].map((s, i) =>
		day(`2026-09-2${i}`, { totalSeconds: s }),
	);
	const grid = heatmap(days, "2026-09-24", "all", 2);
	expect(grid).toHaveLength(2);
	expect(grid[0]?.[0]?.day).toBe("2026-09-14");
	const cells = grid.flat();
	expect(cells.find((c) => c.day === "2026-09-20")?.level).toBe(1);
	expect(cells.find((c) => c.day === "2026-09-23")?.level).toBe(4);
	expect(cells.find((c) => c.day === "2026-09-25")?.future).toBe(true);
});

test("book shares merge Read & Listen and filter by view and range", () => {
	const rows = [
		{
			day: "2026-09-21",
			book: 0,
			medium: "reading" as const,
			seconds: 300,
			characters: 500,
		},
		{
			day: "2026-09-21",
			book: 0,
			medium: "listening" as const,
			seconds: 300,
			characters: 0,
		},
		{
			day: "2026-09-22",
			book: 1,
			medium: "listening" as const,
			seconds: 400,
			characters: 0,
		},
		{
			day: "2026-08-01",
			book: 2,
			medium: "reading" as const,
			seconds: 999,
			characters: 0,
		},
	];
	const range = { from: "2026-09-21", to: "2026-09-27" };
	const all = bookShares(rows, range, "all");
	expect(all.map((b) => [b.book, b.seconds, b.media])).toEqual([
		[0, 600, ["reading", "listening"]],
		[1, 400, ["listening"]],
	]);
	expect(all[0]?.fraction).toBe(0.6);
	expect(bookShares(rows, range, "reading").map((b) => b.book)).toEqual([0]);
});

test("hours and weekdays combine by view from the week clock", () => {
	const reading = Array(7 * 24).fill(0);
	const listening = Array(7 * 24).fill(0);
	reading[22] = 100; // Monday 22:00
	reading[6 * 24 + 22] = 50; // Sunday 22:00
	listening[2 * 24 + 8] = 400; // Wednesday 08:00
	const weekHours = { reading, listening };
	expect(hoursFor(weekHours, "reading")[22]).toBe(150);
	expect(hoursFor(weekHours, "all")[8]).toBe(400);
	expect(weekGrid(weekHours, "reading")[6]?.[22]).toBe(50);
	expect(peakPart(hoursFor(weekHours, "reading"))).toBe("evening");
	expect(peakPart(hoursFor(weekHours, "all"))).toBe("morning");
	expect(peakWeekday(weekHours, "reading")).toBe(0);
	expect(peakWeekday(weekHours, "listening")).toBe(2);
	expect(peakPart(Array(24).fill(0))).toBeNull();
});

test("pace needs ten observed minutes and pages by week while history is short", () => {
	expect(paceOf([{ speedSeconds: 300, speedCharacters: 900 }])).toBeNull();
	expect(paceOf([{ speedSeconds: 1800, speedCharacters: 3000 }])).toBe(6000);
	const days = [
		day("2026-09-01", { speedSeconds: 3600, speedCharacters: 5000 }),
		day("2026-09-22", { speedSeconds: 3600, speedCharacters: 7000 }),
	];
	const weekly = paceSeries(days, "2026-09-24");
	expect(weekly.unit).toBe("week");
	expect(weekly.points.map((p) => [p.from, p.pace])).toEqual([
		["2026-08-31", 5000],
		["2026-09-07", null],
		["2026-09-14", null],
		["2026-09-21", 7000],
	]);
	const monthly = paceSeries(
		[day("2026-01-10", { speedSeconds: 3600, speedCharacters: 4000 }), ...days],
		"2026-09-24",
	);
	expect(monthly.unit).toBe("month");
	expect(monthly.points.map((p) => p.from).slice(0, 2)).toEqual([
		"2026-01-01",
		"2026-02-01",
	]);
	expect(monthly.points.at(-1)?.pace).toBe(6000);
	expect(paceSeries([], "2026-09-24").points).toEqual([]);
});

test("a typical day averages active days of the previous four weeks", () => {
	const days = [
		day("2026-08-01", { totalSeconds: 9999 }),
		day("2026-09-20", { totalSeconds: 600 }),
		day("2026-09-22", { totalSeconds: 1800 }),
		day("2026-09-24", { totalSeconds: 60 }),
	];
	expect(typicalDay(days, "2026-09-24", (d) => d.totalSeconds)).toBe(1200);
	expect(typicalDay([], "2026-09-24", (d) => d.totalSeconds)).toBeNull();
});

test("records pick the quickest finish and the day with most characters", () => {
	const finished = [
		{
			book: 0,
			medium: "reading" as const,
			day: "2026-09-10",
			startedDay: "2026-09-01",
		},
		{
			book: 1,
			medium: "listening" as const,
			day: "2026-09-10",
			startedDay: "2026-09-09",
		},
		{
			book: 2,
			medium: "reading" as const,
			day: "2026-09-12",
			startedDay: null,
		},
	];
	expect(fastestFinish(finished, "all")).toMatchObject({ book: 1, days: 2 });
	expect(fastestFinish(finished, "reading")).toMatchObject({
		book: 0,
		days: 10,
	});
	expect(
		mostCharactersDay([
			day("2026-09-01", { characters: 5 }),
			day("2026-09-02", { characters: 9 }),
		])?.day,
	).toBe("2026-09-02");
});
