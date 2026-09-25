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
export interface OverviewRun {
	book: number;
	medium: Medium;
	closureReason: string | null;
	endedAt: string | null;
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

const hourFormats = new Map<string, Intl.DateTimeFormat>();
function localHour(ms: number, timeZone: string) {
	let format = hourFormats.get(timeZone);
	if (!format) {
		format = new Intl.DateTimeFormat("en-US", {
			timeZone,
			hour: "numeric",
			hourCycle: "h23",
		});
		hourFormats.set(timeZone, format);
	}
	return Number(format.format(ms)) % 24;
}
const QUARTER = 15 * 60_000;

export function summarizeOverview(
	segments: OverviewSegment[],
	runs: OverviewRun[],
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
				sessions: new Set(),
			};
			days.set(day, d);
		}
		return d;
	};
	const bookDays = new Map<string, OverviewBookDay>();
	const hours = {
		reading: Array<number>(24).fill(0),
		listening: Array<number>(24).fill(0),
	};
	let speedSeconds = 0;
	let speedCharacters = 0;
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
		for (const { segment, start, end, density } of pieces) {
			if (segment.kind === "manual") continue;
			for (let at = start; at < end; ) {
				const next = Math.min(end, (Math.floor(at / QUARTER) + 1) * QUARTER);
				const hour = localHour(at, timeZone);
				hours[medium][hour] =
					(hours[medium][hour] ?? 0) + ((next - at) / 1000) * density;
				at = next;
			}
			if (medium === "reading" && segment.characterCount)
				speedSeconds += ((end - start) / 1000) * density;
		}
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
		if (segment.kind !== "manual") speedCharacters += characters;
	}
	for (const run of runs) {
		if (run.closureReason !== "finish" || !run.endedAt) continue;
		const d = dayOf(dayKey(Date.parse(run.endedAt), timeZone, dayStartHour));
		if (run.medium === "reading") d.finishedReading++;
		else d.finishedListening++;
	}
	return {
		days: [...days.values()]
			.map(({ sessions: _, ...d }) => ({
				...d,
				characters: Math.round(d.characters),
			}))
			.sort((a, b) => a.day.localeCompare(b.day)),
		bookDays: [...bookDays.values()]
			.map((r) => ({ ...r, characters: Math.round(r.characters) }))
			.sort((a, b) => a.day.localeCompare(b.day) || a.book - b.book),
		hours,
		// Observed reading only, so declared sessions and jumps never skew the pace.
		speed:
			speedSeconds >= 600 && speedCharacters > 0
				? Math.round((speedCharacters / speedSeconds) * 3600)
				: null,
	};
}
