import {
	addDays,
	daysBetween,
	streaks,
} from "@/features/reading-sessions/reading-history-model";

export type StatsView = "all" | "reading" | "listening";
export type StatsPeriod = "week" | "month" | "year";
export interface StatsDay {
	day: string;
	readingSeconds: number;
	listeningSeconds: number;
	totalSeconds: number;
	characters: number;
	readingSessions: number;
	listeningSessions: number;
	finishedReading: number;
	finishedListening: number;
	speedSeconds: number;
	speedCharacters: number;
}
export interface StatsGoals {
	readingUnit: "characters" | "minutes";
	reading: number | null;
	listeningMinutes: number | null;
}
export interface StatsBookDay {
	day: string;
	book: number;
	medium: "reading" | "listening";
	seconds: number;
	characters: number;
}

export function secondsIn(day: StatsDay | undefined, view: StatsView) {
	if (!day) return 0;
	return view === "all"
		? day.totalSeconds
		: view === "reading"
			? day.readingSeconds
			: day.listeningSeconds;
}
export function sessionsIn(day: StatsDay, view: StatsView) {
	return (
		(view === "listening" ? 0 : day.readingSessions) +
		(view === "reading" ? 0 : day.listeningSessions)
	);
}
export function finishedIn(day: StatsDay, view: StatsView) {
	return (
		(view === "listening" ? 0 : day.finishedReading) +
		(view === "reading" ? 0 : day.finishedListening)
	);
}

/** Share of each daily goal done; null when that goal is not set. Past 100 % stays above 1. */
export function goalRatios(day: StatsDay | undefined, goals: StatsGoals) {
	const reading =
		goals.reading === null
			? null
			: (goals.readingUnit === "characters"
					? (day?.characters ?? 0)
					: (day?.readingSeconds ?? 0) / 60) / goals.reading;
	const listening =
		goals.listeningMinutes === null
			? null
			: (day?.listeningSeconds ?? 0) / 60 / goals.listeningMinutes;
	return { reading, listening };
}

/** Goals that apply to a view; "all" counts both media. */
function viewGoals(view: StatsView, goals: StatsGoals) {
	const ratios = (["reading", "listening"] as const).filter(
		(medium) =>
			(view === "all" || view === medium) &&
			(medium === "reading" ? goals.reading : goals.listeningMinutes) !== null,
	);
	return ratios;
}
export function hasGoal(view: StatsView, goals: StatsGoals) {
	return viewGoals(view, goals).length > 0;
}

/** A day counts when a goal of the view closes (either medium in "all"); with no goal, any activity counts. */
export function dayQualifies(
	day: StatsDay | undefined,
	view: StatsView,
	goals: StatsGoals,
) {
	const media = viewGoals(view, goals);
	if (media.length === 0) return secondsIn(day, view) > 0;
	const ratios = goalRatios(day, goals);
	return media.some((medium) => (ratios[medium] ?? 0) >= 1);
}

export function goalStreaks(
	days: StatsDay[],
	today: string,
	view: StatsView,
	goals: StatsGoals,
) {
	const qualified = days.filter((d) => dayQualifies(d, view, goals));
	return {
		...streaks(
			qualified.map((d) => ({ day: d.day, seconds: 1 })),
			today,
		),
		metDays: qualified.length,
	};
}

export function bestDay(days: StatsDay[], view: StatsView) {
	let best: StatsDay | undefined;
	for (const day of days)
		if (secondsIn(day, view) > secondsIn(best, view)) best = day;
	return best && secondsIn(best, view) > 0 ? best : null;
}

/** Monday, since the app's locales start their weeks there. */
export function mondayOf(day: string) {
	const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
	return addDays(day, -((weekday + 6) % 7));
}

export interface Bucket {
	key: string;
	from: string;
	// Inclusive.
	to: string;
}
export interface PeriodRange {
	from: string;
	to: string;
	buckets: Bucket[];
}

function monthEnd(year: number, month: number) {
	return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}
const monthStart = (year: number, month: number) =>
	new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);

/** The period `offset` steps back from the one holding `today`: days for week and month, months for a year. */
export function periodRange(
	period: StatsPeriod,
	today: string,
	offset = 0,
): PeriodRange {
	const [year, month] = today.split("-").map(Number) as [number, number];
	if (period === "week") {
		const from = addDays(mondayOf(today), -7 * offset);
		const buckets = Array.from({ length: 7 }, (_, i) => {
			const day = addDays(from, i);
			return { key: day, from: day, to: day };
		});
		return { from, to: addDays(from, 6), buckets };
	}
	if (period === "month") {
		const from = monthStart(year, month - 1 - offset);
		const to = monthEnd(year, month - 1 - offset);
		const buckets = Array.from(
			{ length: daysBetween(from, to) + 1 },
			(_, i) => {
				const day = addDays(from, i);
				return { key: day, from: day, to: day };
			},
		);
		return { from, to, buckets };
	}
	const target = year - offset;
	const buckets = Array.from({ length: 12 }, (_, i) => ({
		key: monthStart(target, i).slice(0, 7),
		from: monthStart(target, i),
		to: monthEnd(target, i),
	}));
	return { from: `${target}-01-01`, to: `${target}-12-31`, buckets };
}

/** How many steps back history reaches, so paging stops at the first recorded period. */
export function periodCount(
	period: StatsPeriod,
	first: string | undefined,
	today: string,
) {
	if (!first) return 1;
	let count = 1;
	while (periodRange(period, today, count - 1).from > first) count++;
	return count;
}

export interface SeriesPoint extends Bucket {
	reading: number;
	listening: number;
	total: number;
	characters: number;
	future: boolean;
}

export function periodSeries(
	days: StatsDay[],
	range: PeriodRange,
	today: string,
): SeriesPoint[] {
	const byDay = new Map(days.map((d) => [d.day, d]));
	return range.buckets.map((bucket) => {
		let reading = 0;
		let listening = 0;
		let total = 0;
		let characters = 0;
		for (
			let day = bucket.from;
			day <= bucket.to && day <= today;
			day = addDays(day, 1)
		) {
			const d = byDay.get(day);
			if (!d) continue;
			reading += d.readingSeconds;
			listening += d.listeningSeconds;
			total += d.totalSeconds;
			characters += d.characters;
		}
		return {
			...bucket,
			reading,
			listening,
			total,
			characters,
			future: bucket.from > today,
		};
	});
}

export function viewValue(point: SeriesPoint, view: StatsView) {
	return view === "all"
		? point.total
		: view === "reading"
			? point.reading
			: point.listening;
}

/** Totals over the days of a range already lived, so a week in progress averages its own days. */
export function periodSummary(
	days: StatsDay[],
	range: PeriodRange,
	today: string,
	view: StatsView,
) {
	const until = range.to < today ? range.to : today;
	const elapsed = until < range.from ? 0 : daysBetween(range.from, until) + 1;
	let seconds = 0;
	let characters = 0;
	let finished = 0;
	let activeDays = 0;
	for (const day of days) {
		if (day.day < range.from || day.day > until) continue;
		const value = secondsIn(day, view);
		seconds += value;
		if (view !== "listening") characters += day.characters;
		finished += finishedIn(day, view);
		if (value > 0) activeDays++;
	}
	return {
		seconds,
		characters,
		finished,
		activeDays,
		elapsedDays: elapsed,
		dailyAverage: elapsed > 0 ? seconds / elapsed : 0,
	};
}

/** Change of this period's daily average over the previous one; null without a baseline. */
export function averageChange(current: number, previous: number) {
	if (previous <= 0) return null;
	return (current - previous) / previous;
}

export interface HeatCell {
	day: string;
	seconds: number;
	level: 0 | 1 | 2 | 3 | 4;
	future: boolean;
}

/** Whole weeks ending with today's, columns of Monday→Sunday; levels by quartile of active days. */
export function heatmap(
	days: StatsDay[],
	today: string,
	view: StatsView,
	weeks = 53,
): HeatCell[][] {
	const byDay = new Map(days.map((d) => [d.day, secondsIn(d, view)]));
	const start = addDays(mondayOf(today), -7 * (weeks - 1));
	const values = [...byDay]
		.filter(([day, s]) => day >= start && day <= today && s > 0)
		.map(([, s]) => s)
		.sort((a, b) => a - b);
	const quartile = (q: number) =>
		values[Math.floor((values.length - 1) * q)] ?? 0;
	const cuts = [quartile(0.25), quartile(0.5), quartile(0.75)];
	return Array.from({ length: weeks }, (_, w) =>
		Array.from({ length: 7 }, (_, d) => {
			const day = addDays(start, w * 7 + d);
			const seconds = day <= today ? (byDay.get(day) ?? 0) : 0;
			const level =
				seconds <= 0
					? 0
					: seconds <= (cuts[0] ?? 0)
						? 1
						: seconds <= (cuts[1] ?? 0)
							? 2
							: seconds <= (cuts[2] ?? 0)
								? 3
								: 4;
			return {
				day,
				seconds,
				level: level as HeatCell["level"],
				future: day > today,
			};
		}),
	);
}

export interface BookShare {
	book: number;
	seconds: number;
	characters: number;
	fraction: number;
	media: ("reading" | "listening")[];
}

/** Where the time of a range went; Read & Listen books appear once with both media. */
export function bookShares(
	bookDays: StatsBookDay[],
	range: { from: string; to: string },
	view: StatsView,
): BookShare[] {
	const books = new Map<number, BookShare>();
	for (const row of bookDays) {
		if (row.day < range.from || row.day > range.to) continue;
		if (view !== "all" && row.medium !== view) continue;
		const share = books.get(row.book) ?? {
			book: row.book,
			seconds: 0,
			characters: 0,
			fraction: 0,
			media: [],
		};
		share.seconds += row.seconds;
		share.characters += row.characters;
		if (row.seconds > 0 && !share.media.includes(row.medium))
			share.media.push(row.medium);
		books.set(row.book, share);
	}
	const list = [...books.values()].filter((b) => b.seconds > 0);
	const total = list.reduce((sum, b) => sum + b.seconds, 0);
	return list
		.map((b) => ({ ...b, fraction: total > 0 ? b.seconds / total : 0 }))
		.sort((a, b) => b.seconds - a.seconds || a.book - b.book);
}

export interface WeekHours {
	reading: number[];
	listening: number[];
}

/** Seconds per weekday (Monday first) and hour for a view. */
export function weekGrid(weekHours: WeekHours, view: StatsView) {
	return Array.from({ length: 7 }, (_, d) =>
		Array.from({ length: 24 }, (_, h) => {
			const i = d * 24 + h;
			return (
				(view === "listening" ? 0 : (weekHours.reading[i] ?? 0)) +
				(view === "reading" ? 0 : (weekHours.listening[i] ?? 0))
			);
		}),
	);
}

export function hoursFor(weekHours: WeekHours, view: StatsView) {
	const grid = weekGrid(weekHours, view);
	return Array.from({ length: 24 }, (_, h) =>
		grid.reduce((sum, row) => sum + (row[h] ?? 0), 0),
	);
}

export function peakWeekday(weekHours: WeekHours, view: StatsView) {
	const totals = weekGrid(weekHours, view).map((row) =>
		row.reduce((a, b) => a + b, 0),
	);
	const most = Math.max(...totals);
	return most > 0 ? totals.indexOf(most) : null;
}

/** Named part of the day holding the most time, for the habit headline. */
export function peakPart(values: number[]) {
	const parts = [
		{ key: "morning", hours: [5, 6, 7, 8, 9, 10, 11] },
		{ key: "afternoon", hours: [12, 13, 14, 15, 16, 17, 18] },
		{ key: "evening", hours: [19, 20, 21, 22, 23] },
		{ key: "night", hours: [0, 1, 2, 3, 4] },
	] as const;
	let best: (typeof parts)[number]["key"] | null = null;
	let most = 0;
	for (const part of parts) {
		const sum = part.hours.reduce<number>((s, h) => s + (values[h] ?? 0), 0);
		if (sum > most) {
			most = sum;
			best = part.key;
		}
	}
	return best;
}

/** Characters per hour of observed reading; null until ten minutes back it. */
export function paceOf(
	days: Pick<StatsDay, "speedSeconds" | "speedCharacters">[],
) {
	let seconds = 0;
	let characters = 0;
	for (const day of days) {
		seconds += day.speedSeconds;
		characters += day.speedCharacters;
	}
	return seconds >= 600 && characters > 0
		? Math.round((characters / seconds) * 3600)
		: null;
}

export interface PacePoint {
	key: string;
	from: string;
	pace: number | null;
	seconds: number;
}

/** Pace per month, or per week while history is under three months, oldest first. */
export function paceSeries(days: StatsDay[], today: string) {
	const first = days.find((d) => d.speedSeconds > 0)?.day;
	if (!first) return { unit: "month" as const, points: [] as PacePoint[] };
	const unit =
		daysBetween(first, today) < 90 ? ("week" as const) : ("month" as const);
	const keyOf = (day: string) =>
		unit === "week" ? mondayOf(day) : `${day.slice(0, 7)}-01`;
	const buckets = new Map<string, StatsDay[]>();
	for (let key = keyOf(first); key <= today; ) {
		buckets.set(key, []);
		key =
			unit === "week"
				? addDays(key, 7)
				: (() => {
						const [y, m] = key.split("-").map(Number) as [number, number];
						return monthStart(y, m);
					})();
	}
	for (const day of days) buckets.get(keyOf(day.day))?.push(day);
	const points = [...buckets].map(([from, bucket]) => ({
		key: from,
		from,
		pace: paceOf(bucket),
		seconds: bucket.reduce((sum, d) => sum + d.speedSeconds, 0),
	}));
	return { unit, points: points.slice(-12) };
}

/**
 * Today against a typical day: the mean of active days in the four weeks before
 * today. Gives the ring a scale when no goal is set.
 */
export function typicalDay(
	days: StatsDay[],
	today: string,
	measure: (day: StatsDay) => number,
) {
	const from = addDays(today, -28);
	const values = days
		.filter((d) => d.day >= from && d.day < today)
		.map(measure)
		.filter((v) => v > 0);
	return values.length
		? values.reduce((a, b) => a + b, 0) / values.length
		: null;
}

export interface FinishedBook {
	book: number;
	medium: "reading" | "listening";
	day: string;
	startedDay: string | null;
}

/** Fewest days from starting to finishing a book, counting both ends. */
export function fastestFinish(finished: FinishedBook[], view: StatsView) {
	let best: (FinishedBook & { days: number }) | null = null;
	for (const f of finished) {
		if (!f.startedDay || (view !== "all" && f.medium !== view)) continue;
		const days = daysBetween(f.startedDay, f.day) + 1;
		if (days >= 1 && (!best || days < best.days)) best = { ...f, days };
	}
	return best;
}

export function mostCharactersDay(days: StatsDay[]) {
	let best: StatsDay | null = null;
	for (const day of days)
		if (day.characters > (best?.characters ?? 0)) best = day;
	return best;
}
