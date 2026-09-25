import { dayKey, splitDays } from "./reading-statistics";

export type Medium = "reading" | "listening";
export interface OverviewSegment {
	sessionId: string;
	book: number;
	medium: Medium;
	// Characters in the edition the session read; null for audio or unknown editions.
	characterCount: number | null;
	startedAt: string;
	endedAt: string;
	seconds: number;
	startPosition: number | null;
	endPosition: number | null;
	kind: string;
}
/** One finished reading or listening; a reread finished again is another entry. */
export interface OverviewFinish {
	book: number;
	medium: Medium;
	startedAt: string | null;
	finishedAt: string;
}
export interface OverviewDay {
	day: string;
	readingSeconds: number;
	listeningSeconds: number;
	// Reading and listening at the same moment (Read & Listen) counts once here.
	totalSeconds: number;
	characters: number;
	readingSessions: number;
	listeningSessions: number;
	finishedReading: number;
	finishedListening: number;
	// Observed reading of editions with a known length: the basis of the pace.
	speedSeconds: number;
	speedCharacters: number;
}
export interface OverviewBookDay {
	day: string;
	book: number;
	medium: Medium;
	seconds: number;
	characters: number;
}
interface Piece {
	segment: OverviewSegment;
	start: number;
	end: number;
	density: number;
}

// Same rule as a single book's history: overlapping devices count once, manual entries always count.
function accept(segments: OverviewSegment[]) {
	let coveredUntil = 0;
	const pieces: Piece[] = [];
	for (const segment of segments) {
		const start = Date.parse(segment.startedAt);
		const end = Date.parse(segment.endedAt);
		const duration = end - start;
		if (!(duration > 0)) continue;
		const density = Math.min(1, (segment.seconds * 1000) / duration);
		const from =
			segment.kind === "manual" ? start : Math.max(start, coveredUntil);
		if (segment.kind !== "manual") coveredUntil = Math.max(coveredUntil, end);
		if (end > from && density > 0)
			pieces.push({ segment, start: from, end, density });
	}
	return pieces;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const clockFormats = new Map<string, Intl.DateTimeFormat>();
/** Local weekday (Monday = 0) and hour of an instant. */
function localClock(ms: number, timeZone: string) {
	let format = clockFormats.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone,
			weekday: "short",
			hour: "numeric",
			hourCycle: "h23",
		});
		clockFormats.set(timeZone, format);
	}
	let weekday = 0;
	let hour = 0;
	for (const part of format.formatToParts(ms)) {
		if (part.type === "weekday") weekday = WEEKDAYS.indexOf(part.value);
		if (part.type === "hour") hour = Number(part.value) % 24;
	}
	return { weekday, hour };
}
const QUARTER = 15 * 60_000;

export function summarizeOverview(
	segments: OverviewSegment[],
	finishes: OverviewFinish[],
	timeZone: string,
	dayStartHour = 0,
) {
	const ordered = [...segments].sort(
		(a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
	);
	const days = new Map<string, OverviewDay & { sessions: Set<string> }>();
	const dayOf = (day: string) => {
		let d = days.get(day);
		if (!d) {
			d = {
				day,
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
				sessions: new Set(),
			};
			days.set(day, d);
		}
		return d;
	};
	const bookDays = new Map<string, OverviewBookDay>();
	// Weekday × hour of the local clock, Monday first: index weekday * 24 + hour.
	const weekHours = {
		reading: Array<number>(7 * 24).fill(0),
		listening: Array<number>(7 * 24).fill(0),
	};
	const longest = {
		reading: null as null | {
			seconds: number;
			book: number;
			startedAt: string;
		},
		listening: null as null | {
			seconds: number;
			book: number;
			startedAt: string;
		},
	};
	const each = (
		pieces: Piece[],
		visit: (day: string, piece: Piece, seconds: number) => void,
	) => {
		for (const piece of pieces)
			for (const part of splitDays(
				piece.start,
				piece.end,
				timeZone,
				dayStartHour,
			))
				visit(
					part.day,
					piece,
					((part.end - part.start) / 1000) * piece.density,
				);
	};
	each(accept(ordered), (day, _piece, seconds) => {
		dayOf(day).totalSeconds += seconds;
	});
	for (const medium of ["reading", "listening"] as const) {
		const pieces = accept(ordered.filter((s) => s.medium === medium));
		each(pieces, (day, { segment }, seconds) => {
			const d = dayOf(day);
			if (medium === "reading") d.readingSeconds += seconds;
			else d.listeningSeconds += seconds;
			if (!d.sessions.has(segment.sessionId)) {
				d.sessions.add(segment.sessionId);
				if (medium === "reading") d.readingSessions++;
				else d.listeningSessions++;
			}
			const key = `${day}|${segment.book}|${medium}`;
			const row = bookDays.get(key) ?? {
				day,
				book: segment.book,
				medium,
				seconds: 0,
				characters: 0,
			};
			row.seconds += seconds;
			bookDays.set(key, row);
		});
		const sessions = new Map<
			string,
			{ seconds: number; book: number; startedAt: number }
		>();
		for (const { segment, start, end, density } of pieces) {
			// Declared sessions carry no clock time or pace, only their duration.
			if (segment.kind === "manual") continue;
			for (let at = start; at < end; ) {
				const next = Math.min(end, (Math.floor(at / QUARTER) + 1) * QUARTER);
				const { weekday, hour } = localClock(at, timeZone);
				const index = weekday * 24 + hour;
				weekHours[medium][index] =
					(weekHours[medium][index] ?? 0) + ((next - at) / 1000) * density;
				at = next;
			}
			const seconds = ((end - start) / 1000) * density;
			const session = sessions.get(segment.sessionId) ?? {
				seconds: 0,
				book: segment.book,
				startedAt: start,
			};
			session.seconds += seconds;
			sessions.set(segment.sessionId, session);
			if (medium === "reading" && segment.characterCount)
				for (const part of splitDays(start, end, timeZone, dayStartHour))
					dayOf(part.day).speedSeconds +=
						((part.end - part.start) / 1000) * density;
		}
		for (const session of sessions.values())
			if (session.seconds > (longest[medium]?.seconds ?? 0))
				longest[medium] = {
					seconds: session.seconds,
					book: session.book,
					startedAt: new Date(session.startedAt).toISOString(),
				};
	}
	// Characters follow forward progress on the day it ends, like a book's own history.
	for (const segment of ordered) {
		if (
			segment.medium !== "reading" ||
			segment.kind === "jump" ||
			!segment.characterCount ||
			segment.startPosition === null ||
			segment.endPosition === null
		)
			continue;
		const characters =
			Math.max(0, segment.endPosition - segment.startPosition) *
			segment.characterCount;
		if (characters <= 0) continue;
		const day = dayKey(Date.parse(segment.endedAt), timeZone, dayStartHour);
		dayOf(day).characters += characters;
		const key = `${day}|${segment.book}|reading`;
		const row = bookDays.get(key) ?? {
			day,
			book: segment.book,
			medium: "reading" as const,
			seconds: 0,
			characters: 0,
		};
		row.characters += characters;
		bookDays.set(key, row);
		if (segment.kind !== "manual") dayOf(day).speedCharacters += characters;
	}
	const finished = finishes
		.map((f) => ({
			book: f.book,
			medium: f.medium,
			day: dayKey(Date.parse(f.finishedAt), timeZone, dayStartHour),
			startedDay: f.startedAt
				? dayKey(Date.parse(f.startedAt), timeZone, dayStartHour)
				: null,
		}))
		.sort((a, b) => a.day.localeCompare(b.day));
	for (const f of finished) {
		const d = dayOf(f.day);
		if (f.medium === "reading") d.finishedReading++;
		else d.finishedListening++;
	}
	return {
		days: [...days.values()]
			.map(({ sessions: _, ...d }) => ({
				...d,
				characters: Math.round(d.characters),
				speedCharacters: Math.round(d.speedCharacters),
			}))
			.sort((a, b) => a.day.localeCompare(b.day)),
		bookDays: [...bookDays.values()]
			.map((r) => ({ ...r, characters: Math.round(r.characters) }))
			.sort((a, b) => a.day.localeCompare(b.day) || a.book - b.book),
		weekHours,
		finished,
		longestSession: longest,
	};
}
