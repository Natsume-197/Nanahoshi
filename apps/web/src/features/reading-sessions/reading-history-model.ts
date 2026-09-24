export type ReadingUnit = "chars" | "percent" | "audio";
export type ChartPeriod = "week" | "month" | "all";

/** What one whole book measures: characters, seconds of audio, or plain percent. */
export interface ReadingScale {
	unit: ReadingUnit;
	total: number;
}

export interface HistoryDay {
	day: string;
	seconds: number;
	observedSeconds: number;
	progress: number;
	manualProgress: number;
	startPosition: number | null;
	endPosition: number | null;
}

export interface ChartSlot {
	day: string;
	seconds: number;
	amount: number;
	// Portions declared by hand rather than measured by the reader.
	manualSeconds: number;
	manualAmount: number;
	startPosition: number | null;
	endPosition: number | null;
	// Last known position at the end of this slot, carried across idle days.
	position: number | null;
	read: boolean;
	// Days after today, present only to draw the projection to the finish.
	future: boolean;
}

// Past this many calendar days "all" collapses to reading days only, so bars stay legible.
const MAX_CALENDAR_SLOTS = 90;

export function readingScale(
	amountChars: number | null | undefined,
): ReadingScale {
	return amountChars && amountChars > 0
		? { unit: "chars", total: amountChars }
		: { unit: "percent", total: 100 };
}

export function listeningScale(
	durationSeconds: number | null | undefined,
): ReadingScale {
	return durationSeconds && durationSeconds > 0
		? { unit: "audio", total: durationSeconds }
		: { unit: "percent", total: 100 };
}

/** Characters read, seconds of audio heard, or percentage points of the book. */
export function progressAmount(progress: number, scale: ReadingScale) {
	return scale.unit === "chars"
		? Math.round(progress * scale.total)
		: progress * scale.total;
}

/** Characters or percent per hour; for audio, the multiple of real time (1.5 = 1.5×). */
export function displaySpeed(speed: number | null, scale: ReadingScale) {
	if (speed === null) return null;
	if (scale.unit === "audio") return speed * scale.total;
	const perHour = speed * 3600;
	return scale.unit === "chars"
		? Math.round((perHour * scale.total) / 100) * 100
		: perHour * 100;
}

export function daysToFinish(
	remainingSeconds: number | null,
	totalSeconds: number,
	readingDays: number,
) {
	if (!remainingSeconds || readingDays === 0 || totalSeconds <= 0) return null;
	return Math.max(
		1,
		Math.ceil(remainingSeconds / (totalSeconds / readingDays)),
	);
}

export function addDays(day: string, amount: number) {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + amount);
	return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
	return Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
			86400_000,
	);
}

export function defaultPeriod(days: HistoryDay[], today: string): ChartPeriod {
	const last = days.at(-1)?.day;
	return last && daysBetween(last, today) < 30 ? "month" : "all";
}

export function chartSlots(
	days: HistoryDay[],
	period: ChartPeriod,
	today: string,
	scale: ReadingScale,
	// Stretch "all" to today, so an in-progress book's line meets the projection.
	untilToday = false,
): ChartSlot[] {
	if (days.length === 0 && period === "all") return [];
	const byDay = new Map(days.map((d) => [d.day, d]));
	let calendar: string[];
	if (period === "all") {
		const first = days[0]?.day ?? today;
		const lastRead = days.at(-1)?.day ?? today;
		const last = untilToday && lastRead < today ? today : lastRead;
		const span = daysBetween(first, last) + 1;
		calendar =
			span > MAX_CALENDAR_SLOTS
				? days.map((d) => d.day)
				: Array.from({ length: span }, (_, i) => addDays(first, i));
	} else {
		const length = period === "week" ? 7 : 30;
		// A reading that began inside the window starts there, instead of leaving blank days before it.
		const first = days[0]?.day;
		calendar = Array.from({ length }, (_, i) =>
			addDays(today, i - length + 1),
		).filter((day) => !first || day >= first);
	}
	let position: number | null = null;
	for (const d of days) {
		if (d.day >= (calendar[0] ?? "")) break;
		if (d.endPosition !== null) position = d.endPosition;
	}
	return calendar.map((day) => {
		const d = byDay.get(day);
		if (d?.endPosition != null) position = d.endPosition;
		return {
			day,
			seconds: d?.seconds ?? 0,
			amount: d ? progressAmount(d.progress, scale) : 0,
			manualSeconds: d ? Math.max(0, d.seconds - d.observedSeconds) : 0,
			manualAmount: d ? progressAmount(d.manualProgress, scale) : 0,
			startPosition: d?.startPosition ?? null,
			endPosition: d?.endPosition ?? null,
			position: day > today ? null : position,
			read: Boolean(d && d.seconds > 0),
			future: false,
		};
	});
}

/** Axis bounds hugging the data, so small but real changes in speed stay visible. */
export function paceDomain(values: number[]) {
	const high = niceMaximum(Math.max(...values) * 1.1);
	const step = high / 4;
	const low = Math.min(
		high - step,
		Math.max(0, Math.floor((Math.min(...values) * 0.85) / step) * step),
	);
	const ticks = Array.from(
		{ length: Math.round((high - low) / step) + 1 },
		(_, i) => low + i * step,
	);
	return { low, high, ticks };
}

/** Round up to 1, 2, 2.5 or 5 × 10ⁿ so four gridlines land on readable numbers. */
export function niceMaximum(value: number) {
	if (value <= 0) return 1;
	const magnitude = 10 ** Math.floor(Math.log10(value));
	const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
	return step * magnitude;
}

export function timeMaximum(seconds: number) {
	const step =
		seconds <= 240
			? 60
			: seconds <= 1200
				? 300
				: seconds <= 3600
					? 900
					: 1800 * Math.ceil(seconds / 7200);
	return step * 4;
}

/**
 * Today's reading against the average of earlier reading days, so today never
 * skews its own baseline. `time` compares real seconds, as listening does.
 */
export function todayVersusAverage(
	days: HistoryDay[],
	today: string,
	scale: ReadingScale,
	measure: "progress" | "time" = "progress",
) {
	const value = (d: HistoryDay) =>
		measure === "time" ? d.seconds : progressAmount(d.progress, scale);
	const current = days.find((d) => d.day === today);
	const earlier = days.filter((d) => d.day < today && value(d) > 0);
	const average = earlier.length
		? earlier.reduce((sum, d) => sum + value(d), 0) / earlier.length
		: null;
	const amount = current ? value(current) : 0;
	return {
		amount,
		average,
		// Whole percent above the average; null when not ahead by at least 1 %.
		ahead:
			average && Math.round((amount / average - 1) * 100) >= 1
				? Math.round((amount / average - 1) * 100)
				: null,
	};
}

export function runSummary(days: HistoryDay[]) {
	const first = days[0]?.day;
	const last = days.at(-1)?.day;
	if (!first || !last) return null;
	return {
		first,
		last,
		readingDays: days.length,
		seconds: days.reduce((sum, d) => sum + d.seconds, 0),
	};
}

/**
 * Reading days left. Prefers the time-based estimate; otherwise uses the
 * average daily advance once three days of progress exist.
 */
export function finishInDays(input: {
	remainingSeconds: number | null;
	totalSeconds: number;
	position: number | null;
	days: HistoryDay[];
}) {
	const byTime = daysToFinish(
		input.remainingSeconds,
		input.totalSeconds,
		input.days.length,
	);
	if (byTime !== null) return byTime;
	if (input.position === null || input.position >= 1) return null;
	const advancing = input.days.filter((d) => d.progress > 0);
	if (advancing.length < 3) return null;
	const perDay =
		advancing.reduce((sum, d) => sum + d.progress, 0) / advancing.length;
	return perDay > 0
		? Math.max(1, Math.ceil((1 - input.position) / perDay))
		: null;
}

export interface Projection {
	fromIndex: number;
	fromPosition: number;
	// Slot index where the line reaches 100 %; may lie past the last slot.
	targetIndex: number;
	finishDay: string;
}

/** Appends a short run of future days so the chart can show the road to the finish. */
export function withProjection(
	slots: ChartSlot[],
	finishIn: number | null,
	today: string,
): { slots: ChartSlot[]; projection: Projection | null } {
	const fromIndex = slots.length - 1;
	const from = slots[fromIndex];
	if (
		finishIn === null ||
		!from ||
		from.day !== today ||
		from.position === null ||
		from.position >= 1
	)
		return { slots, projection: null };
	const room = Math.max(3, Math.round(slots.length * 0.35));
	const future = Array.from(
		{ length: Math.min(finishIn, room) },
		(_, i): ChartSlot => ({
			day: addDays(today, i + 1),
			seconds: 0,
			amount: 0,
			manualSeconds: 0,
			manualAmount: 0,
			startPosition: null,
			endPosition: null,
			position: null,
			read: false,
			future: true,
		}),
	);
	return {
		slots: [...slots, ...future],
		projection: {
			fromIndex,
			fromPosition: from.position,
			targetIndex: fromIndex + finishIn,
			finishDay: addDays(today, finishIn),
		},
	};
}

function medianOf(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[middle] ?? 0)
		: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Rolling median, so one distracted session does not bend the trend. */
export function paceTrend(rates: number[], window = 5) {
	const half = Math.floor(window / 2);
	return rates.map((_, i) =>
		medianOf(rates.slice(Math.max(0, i - half), i + half + 1)),
	);
}

/** Whole-percent change from the first third of sessions to the last third. */
export function paceChange(rates: number[]) {
	// Below six sessions each third is a single sitting, which is noise, not a trend.
	if (rates.length < 6) return null;
	const third = Math.max(1, Math.floor(rates.length / 3));
	const first = medianOf(rates.slice(0, third));
	const last = medianOf(rates.slice(-third));
	return first > 0 ? Math.round((last / first - 1) * 100) : null;
}

/** Monday of the day's week; weeks start on Monday in es and ja reading habits alike. */
export function weekStart(day: string) {
	const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
	return addDays(day, -((weekday + 6) % 7));
}

/** Consecutive days sharing a week, keeping the input order. */
export function groupByWeek<Day extends { day: string }>(days: Day[]) {
	const weeks: { start: string; days: Day[] }[] = [];
	for (const day of days) {
		const start = weekStart(day.day);
		const last = weeks.at(-1);
		if (last?.start === start) last.days.push(day);
		else weeks.push({ start, days: [day] });
	}
	return weeks;
}

/** Speed of one row (day, week, session) as read ÷ time; too short a sitting says nothing. */
export function rowSpeed(
	progress: number,
	seconds: number,
	scale: ReadingScale,
) {
	if (seconds < 60 || progress <= 0) return null;
	return displaySpeed(progress / seconds, scale);
}

export interface ReadRange {
	start: number;
	end: number;
	manual: boolean;
}

/** Stretches actually read, lowest first; jumps are navigation and backwards moves are not reading. */
export function readRanges(
	ranges: {
		start: number | null;
		end: number | null;
		kind: string;
	}[],
): ReadRange[] {
	return ranges
		.flatMap((r) =>
			r.kind === "jump" ||
			r.start === null ||
			r.end === null ||
			r.end <= r.start
				? []
				: [{ start: r.start, end: r.end, manual: r.kind === "manual" }],
		)
		.sort((a, b) => a.start - b.start);
}

/**
 * Joins touching stretches into continuous spans and keeps where they overlap,
 * so a row shows skipped gaps and reread passages rather than one bead per chunk.
 */
export function mergeRanges(ranges: ReadRange[], gap = 0.001) {
	const spans: ReadRange[] = [];
	const rereads: { start: number; end: number }[] = [];
	for (const range of ranges) {
		const last = spans.at(-1);
		if (last && range.start <= last.end + gap) {
			if (range.start < last.end - gap)
				rereads.push({
					start: range.start,
					end: Math.min(range.end, last.end),
				});
			last.end = Math.max(last.end, range.end);
			last.manual = last.manual && range.manual;
		} else spans.push({ ...range });
	}
	return { spans, rereads };
}

export type GoalStatus =
	| {
			kind: "active";
			daysLeft: number;
			// Book fraction to read per day, today included, to finish on the goal day.
			perDay: number;
			todayLeft: number;
			// Whole days the current pace overshoots the goal; null without a pace.
			lateBy: number | null;
	  }
	| { kind: "overdue" }
	| { kind: "met"; daysEarly: number }
	| { kind: "missed"; daysLate: number };

export function goalStatus(input: {
	goalDate: string | null;
	today: string;
	position: number | null;
	days: HistoryDay[];
	finishIn: number | null;
	// Local day the reading was finished on, when it is.
	finishedOn: string | null;
}): GoalStatus | null {
	const { goalDate, today } = input;
	if (!goalDate) return null;
	if (input.finishedOn) {
		const early = daysBetween(input.finishedOn, goalDate);
		return early >= 0
			? { kind: "met", daysEarly: early }
			: { kind: "missed", daysLate: -early };
	}
	if (input.position === null) return null;
	// The goal day itself still counts as a reading day.
	const daysLeft = daysBetween(today, goalDate) + 1;
	if (daysLeft <= 0) return { kind: "overdue" };
	const todayProgress = input.days.find((d) => d.day === today)?.progress ?? 0;
	const perDay = (Math.max(0, 1 - input.position) + todayProgress) / daysLeft;
	return {
		kind: "active",
		daysLeft,
		perDay,
		todayLeft: Math.max(0, perDay - todayProgress),
		lateBy:
			input.finishIn === null
				? null
				: Math.max(0, input.finishIn - (daysLeft - 1)),
	};
}

/**
 * Where today, the estimated finish and the goal fall on one date axis that
 * starts with the reading and ends at whichever of the two comes last.
 */
export function goalTimeline(input: {
	start: string;
	today: string;
	goalDay: string;
	finishDay: string | null;
}) {
	const end =
		input.finishDay && input.finishDay > input.goalDay
			? input.finishDay
			: input.goalDay;
	const span = Math.max(1, daysBetween(input.start, end));
	const at = (day: string) =>
		Math.min(1, Math.max(0, daysBetween(input.start, day) / span));
	return {
		today: at(input.today),
		goal: at(input.goalDay),
		finish: input.finishDay ? at(input.finishDay) : null,
		late: input.finishDay ? input.finishDay > input.goalDay : null,
	};
}

/** Consecutive days with activity; a streak ending yesterday is still alive until today ends. */
export function streaks(
	days: { day: string; seconds: number }[],
	today: string,
) {
	const active = days
		.filter((d) => d.seconds > 0)
		.map((d) => d.day)
		.sort();
	let best = 0;
	let run = 0;
	let previous: string | undefined;
	for (const day of active) {
		run = previous && daysBetween(previous, day) === 1 ? run + 1 : 1;
		best = Math.max(best, run);
		previous = day;
	}
	const alive = previous !== undefined && daysBetween(previous, today) <= 1;
	return { current: alive ? run : 0, best };
}

/** Audio time as a player shows it: 52:10, or 4:52:10 past the hour. */
export function formatClock(seconds: number) {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A chapter start as a fraction of the book, shared by text and audio. */
export interface BookChapter {
	title: string | null;
	start: number;
}

/** 1-based chapter holding a book position; null without chapters or before the first. */
export function chapterAt(chapters: BookChapter[], position: number) {
	let found: number | null = null;
	for (let i = 0; i < chapters.length; i++)
		if ((chapters[i]?.start ?? 0) <= position + 1e-6) found = i + 1;
	return found;
}

/**
 * The reader's table of contents as book fractions. Only labelled top-level
 * sections count, so covers and title pages do not become "Chapter 1".
 */
export function readerChapters(
	sections: {
		label?: string;
		startCharacter?: number;
		parentChapter?: string;
	}[],
	totalCharacters: number,
): BookChapter[] | null {
	if (totalCharacters <= 0) return null;
	const chapters = sections
		.filter(
			(s) => s.label && !s.parentChapter && s.startCharacter !== undefined,
		)
		.map((s) => ({
			title: s.label?.trim().slice(0, 300) || null,
			start: Math.min(
				1,
				Math.max(0, (s.startCharacter ?? 0) / totalCharacters),
			),
		}))
		.sort((a, b) => a.start - b.start)
		.slice(0, 500);
	// Cover, title page and contents are listed too; tiny leading entries are not chapters.
	while (
		chapters.length > 1 &&
		(chapters[1]?.start ?? 1) - (chapters[0]?.start ?? 0) < 0.01
	)
		chapters.shift();
	return chapters.length ? chapters : null;
}

/** Seconds from "m:ss" or "h:mm:ss", the inverse of formatClock; null when unreadable. */
export function parseClock(text: string) {
	const parts = text.trim().split(":");
	if (
		parts.length < 2 ||
		parts.length > 3 ||
		!parts.every((p) => /^\d+$/.test(p))
	)
		return null;
	const [h, m, s] =
		parts.length === 3 ? parts.map(Number) : [0, ...parts.map(Number)];
	if ((m ?? 0) >= 60 && parts.length === 3) return null;
	if ((s ?? 0) >= 60) return null;
	return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
}

/** The reading day an instant falls on, matching the server's day grouping. */
export function readingDay(ms: number, timeZone: string, startHour = 0) {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(
		ms - startHour * 3600_000,
	);
}

/** Book fraction left until the next chapter starts, or the end of the book. */
export function chapterLeft(chapters: BookChapter[], position: number) {
	const number = chapterAt(chapters, position);
	if (number === null) return null;
	const end = chapters[number]?.start ?? 1;
	return Math.max(0, end - position);
}

/** Time to cover a book fraction at the measured speed (fraction per second). */
export function timeFor(fraction: number, speed: number | null) {
	return speed && speed > 0 ? fraction / speed : null;
}
