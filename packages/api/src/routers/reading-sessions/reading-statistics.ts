export interface StatisticsSegment {
	id: string;
	sessionId: string;
	startedAt: string;
	endedAt: string;
	seconds: number;
	startPosition: number | null;
	endPosition: number | null;
	kind: string;
}
export interface DailySession {
	id: string;
	startedAt: string;
	seconds: number;
	startPosition: number | null;
	endPosition: number | null;
}
export interface StatisticsSession {
	id: string;
	contentVersion: string;
	mode: string;
}
/** Local calendar day of an instant; a day may start after midnight (`startHour`). */
export function dayKey(ms: number, timeZone: string, startHour = 0) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(ms - startHour * 3600_000);
}
/** Split at the actual local day boundary, including DST and fractional offsets. */
export function splitDays(
	startMs: number,
	end: number,
	timeZone: string,
	startHour = 0,
) {
	const key = (ms: number) => dayKey(ms, timeZone, startHour);
	let start = startMs;
	const parts: { day: string; start: number; end: number }[] = [];
	while (start < end) {
		const day = key(start);
		let boundary = end;
		if (key(end - 1) !== day) {
			let low = start + 1;
			let high = Math.min(end, start + 27 * 3600_000);
			while (high - low > 1) {
				const mid = Math.floor((low + high) / 2);
				if (key(mid) === day) low = mid;
				else high = mid;
			}
			boundary = high;
		}
		parts.push({ day, start, end: boundary });
		start = boundary;
	}
	return parts;
}
export function summarizeReading(
	segments: StatisticsSegment[],
	sessions: StatisticsSession[],
	timeZone: string,
	dayStartHour = 0,
) {
	const ordered = [...segments].sort(
		(a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
	);
	const days = new Map<
		string,
		{
			day: string;
			seconds: number;
			observedSeconds: number;
			progress: number;
			manualProgress: number;
			startPosition: number | null;
			endPosition: number | null;
			sessionIds: string[];
			sessions: DailySession[];
			ranges: { id: string; start: number; end: number; kind: string }[];
		}
	>();
	const bySession = new Map<string, number>();
	const sessionStartedAt = new Map<string, number>();
	let coveredUntil = 0;
	let overlapSeconds = 0;
	let totalSeconds = 0;
	for (const s of ordered) {
		const start = Date.parse(s.startedAt);
		const end = Date.parse(s.endedAt);
		const duration = end - start;
		if (duration < 0) continue;
		const density =
			duration > 0 ? Math.min(1, (s.seconds * 1000) / duration) : 0;
		// Manual durations are declarations, not evidence of continuous activity.
		const acceptedStart =
			s.kind === "manual" ? start : Math.max(start, coveredUntil);
		if (s.kind !== "manual") {
			overlapSeconds +=
				(Math.max(0, Math.min(end, coveredUntil) - start) / 1000) * density;
			coveredUntil = Math.max(coveredUntil, end);
			if (!sessionStartedAt.has(s.sessionId))
				sessionStartedAt.set(s.sessionId, start);
		}
		const acceptedSeconds = (Math.max(0, end - acceptedStart) / 1000) * density;
		totalSeconds += acceptedSeconds;
		if (s.kind !== "manual")
			bySession.set(
				s.sessionId,
				(bySession.get(s.sessionId) ?? 0) + acceptedSeconds,
			);
		const parts =
			duration === 0
				? [{ day: dayKey(start, timeZone, dayStartHour), start, end }]
				: splitDays(start, end, timeZone, dayStartHour);
		for (const part of parts) {
			const d = days.get(part.day) ?? {
				day: part.day,
				seconds: 0,
				observedSeconds: 0,
				progress: 0,
				manualProgress: 0,
				startPosition: null,
				endPosition: null,
				sessionIds: [],
				sessions: [],
				ranges: [],
			};
			const seconds =
				(Math.max(0, part.end - Math.max(part.start, acceptedStart)) / 1000) *
				density;
			// Reuse the same accepted time for day totals and session rows. Never
			// interpolate positions at midnight or count overlapping devices twice.
			let row = d.sessions.find((row) => row.id === s.sessionId);
			if (!row) {
				row = {
					id: s.sessionId,
					startedAt: new Date(part.start).toISOString(),
					seconds: 0,
					startPosition: part.start === start ? s.startPosition : null,
					endPosition: null,
				};
				d.sessions.push(row);
			}
			row.seconds += seconds;
			row.endPosition = part.end === end ? s.endPosition : null;
			d.seconds += seconds;
			if (s.kind !== "manual") d.observedSeconds += seconds;
			if (!d.sessionIds.includes(s.sessionId)) d.sessionIds.push(s.sessionId);
			if (part.start === start && d.startPosition === null)
				d.startPosition = s.startPosition;
			if (part.end === end) d.endPosition = s.endPosition;
			// Forward progress lands on the day the segment ends; jumps are navigation, not reading.
			if (
				part.end === end &&
				s.kind !== "jump" &&
				s.startPosition !== null &&
				s.endPosition !== null
			) {
				const advance = Math.max(0, s.endPosition - s.startPosition);
				d.progress += advance;
				if (s.kind === "manual") d.manualProgress += advance;
			}
			if (
				part.start === start &&
				part.end === end &&
				s.startPosition !== null &&
				s.endPosition !== null
			)
				d.ranges.push({
					id: s.id,
					start: s.startPosition,
					end: s.endPosition,
					kind: s.kind,
				});
			days.set(part.day, d);
		}
	}
	const observed = ordered.filter((s) => s.kind !== "manual");
	const latest = observed.at(-1);
	const version = sessions.find(
		(s) => s.id === latest?.sessionId,
	)?.contentVersion;
	const compatible = sessions.filter(
		(s) => s.contentVersion === version && s.mode !== "retrospective",
	);
	const measured = compatible
		.map((session) => {
			const parts = observed.filter(
				(s) =>
					s.sessionId === session.id &&
					(s.kind === "reading" || s.kind === "listening"),
			);
			const seconds = parts.reduce((sum, s) => sum + s.seconds, 0);
			// Union the forward ranges so rereading the same paragraph cannot inflate speed.
			const ranges = parts
				.flatMap((s) =>
					s.startPosition !== null &&
					s.endPosition !== null &&
					s.endPosition > s.startPosition
						? [[s.startPosition, s.endPosition] as const]
						: [],
				)
				.sort((a, b) => a[0] - b[0]);
			let coverage = 0;
			let until = 0;
			for (const [from, to] of ranges) {
				coverage += Math.max(0, to - Math.max(from, until));
				until = Math.max(until, to);
			}
			return {
				id: session.id,
				seconds,
				rate: seconds > 0 ? coverage / seconds : 0,
				listening: parts.some((s) => s.kind === "listening"),
			};
		})
		// The cap rejects misread jumps in text; playback already records seeks separately.
		.filter(
			(s) => s.seconds >= 60 && s.rate > 0 && (s.listening || s.rate <= 0.001),
		);
	const samples = measured.slice(0, 20);
	const allRates = measured.map((s) => s.rate).sort((a, b) => a - b);
	const typical = allRates[Math.floor(allRates.length / 2)] ?? 0;
	// Per-session pace for the speed chart; the same outlier band as the estimate drops misread jumps.
	const paces = measured
		.filter((s) => s.rate >= typical / 3 && s.rate <= typical * 3)
		.flatMap((s) => {
			const start = sessionStartedAt.get(s.id);
			return start === undefined
				? []
				: [
						{
							sessionId: s.id,
							startedAt: new Date(start).toISOString(),
							seconds: s.seconds,
							rate: s.rate,
						},
					];
		})
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
	const rates = samples.map((s) => s.rate).sort((a, b) => a - b);
	const median = rates[Math.floor(rates.length / 2)] ?? 0;
	const valid = samples.filter(
		(s) => s.rate >= median / 3 && s.rate <= median * 3,
	);
	const validSeconds = valid.reduce((sum, s) => sum + s.seconds, 0);
	const enough = valid.length >= 3 && validSeconds >= 1800;
	const remainingSeconds =
		enough &&
		median > 0 &&
		latest?.endPosition !== null &&
		latest?.endPosition !== undefined &&
		overlapSeconds === 0
			? Math.max(
					latest.endPosition < 1 ? 300 : 0,
					Math.round((1 - latest.endPosition) / median / 300) * 300,
				)
			: null;
	const daily = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
	const longest = [...bySession]
		.sort(
			(a, b) =>
				b[1] - a[1] ||
				(sessionStartedAt.get(b[0]) ?? 0) - (sessionStartedAt.get(a[0]) ?? 0),
		)
		.at(0);
	const bestDay = [...daily]
		.sort(
			(a, b) =>
				b.observedSeconds - a.observedSeconds || b.day.localeCompare(a.day),
		)
		.at(0);
	return {
		totalSeconds,
		overlapSeconds,
		remainingSeconds,
		position: ordered.at(-1)?.endPosition ?? null,
		// Book fraction per second of reading; the median session resists outliers.
		speed: valid.length > 0 && median > 0 ? median : null,
		paces,
		// What the remaining-time estimate still lacks, so the UI can say exactly how much more to read.
		estimateNeeds: enough
			? null
			: {
					sessions: Math.max(0, 3 - valid.length),
					seconds: Math.max(0, 1800 - validSeconds),
				},
		days: daily,
		longestSession: longest ? { id: longest[0], seconds: longest[1] } : null,
		bestDay:
			bestDay && bestDay.observedSeconds > 0
				? { day: bestDay.day, seconds: bestDay.observedSeconds }
				: null,
	};
}
