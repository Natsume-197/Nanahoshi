import { expect, test } from "bun:test";
import {
	type StatisticsSegment,
	splitDays,
	summarizeReading,
} from "../reading-statistics";

function segment(
	overrides: Partial<StatisticsSegment> = {},
): StatisticsSegment {
	return {
		id: crypto.randomUUID(),
		sessionId: "s1",
		startedAt: "2026-01-01T12:00:00Z",
		endedAt: "2026-01-01T12:10:00Z",
		seconds: 600,
		startPosition: 0.1,
		endPosition: 0.12,
		kind: "reading",
		...overrides,
	};
}
test("counts simultaneous device intervals once", () => {
	const result = summarizeReading(
		[
			segment(),
			segment({
				sessionId: "s2",
				startedAt: "2026-01-01T12:05:00Z",
				endedAt: "2026-01-01T12:15:00Z",
			}),
		],
		[],
		"UTC",
	);
	expect(result.totalSeconds).toBe(900);
	expect(result.overlapSeconds).toBe(300);
	expect(result.days[0]?.sessions.map((s) => s.seconds)).toEqual([600, 300]);
});
test("midnight splits time without inventing a position at midnight", () => {
	const result = summarizeReading(
		[
			segment({
				startedAt: "2026-01-02T04:55:00Z",
				endedAt: "2026-01-02T05:05:00Z",
			}),
		],
		[],
		"America/Bogota",
	);
	expect(result.days.map((d) => d.seconds)).toEqual([300, 300]);
	expect(result.days[0]?.endPosition).toBeNull();
	expect(result.days[1]?.startPosition).toBeNull();
	expect(result.days.map((d) => d.sessions[0])).toEqual([
		{
			id: "s1",
			startedAt: "2026-01-02T04:55:00.000Z",
			seconds: 300,
			startPosition: 0.1,
			endPosition: null,
		},
		{
			id: "s1",
			startedAt: "2026-01-02T05:00:00.000Z",
			seconds: 300,
			startPosition: null,
			endPosition: 0.12,
		},
	]);
});
test("DST day boundary uses the local calendar", () => {
	const parts = splitDays(
		Date.parse("2026-03-08T05:00:00Z"),
		Date.parse("2026-03-09T05:00:00Z"),
		"America/New_York",
	);
	expect(parts).toHaveLength(2);
	const first = parts[0];
	if (!first) throw new Error("Expected a local day boundary");
	expect((first.end - first.start) / 3600000).toBe(23);
});
test("manual sessions contribute history but not records or estimates", () => {
	const result = summarizeReading(
		[segment({ kind: "manual" })],
		[{ id: "s1", mode: "retrospective", contentVersion: "manual" }],
		"UTC",
	);
	expect(result.totalSeconds).toBe(600);
	expect(result.longestSession).toBeNull();
	expect(result.bestDay).toBeNull();
	expect(result.remainingSeconds).toBeNull();
});
test("estimates include time spent on the same page", () => {
	const segments = Array.from({ length: 3 }, (_, i) =>
		segment({
			sessionId: `s${i}`,
			startedAt: `2026-01-0${i + 1}T12:00:00Z`,
			endedAt: `2026-01-0${i + 1}T12:10:00Z`,
			startPosition: i * 0.02,
			endPosition: (i + 1) * 0.02,
		}),
	);
	const sessions = segments.map((s) => ({
		id: s.sessionId,
		mode: "automatic",
		contentVersion: "v1",
	}));
	const result = summarizeReading(segments, sessions, "UTC");
	expect(result.remainingSeconds).toBeGreaterThan(27000);
	expect(result.remainingSeconds).toBeLessThan(30000);
});
test("jumps, version changes, and insufficient samples suppress estimates", () => {
	const s = segment({ kind: "jump", endPosition: 0.99 });
	expect(
		summarizeReading(
			[s],
			[{ id: s.sessionId, mode: "automatic", contentVersion: "v1" }],
			"UTC",
		).remainingSeconds,
	).toBeNull();
});
test("repeated ranges cannot inflate coverage", () => {
	const segments = Array.from({ length: 3 }, (_, i) =>
		segment({
			sessionId: `s${i}`,
			startedAt: `2026-01-0${i + 1}T12:00:00Z`,
			endedAt: `2026-01-0${i + 1}T12:10:00Z`,
		}),
	);
	const sessions = segments.map((s) => ({
		id: s.sessionId,
		mode: "automatic",
		contentVersion: "v1",
	}));
	const repeated = segments.flatMap((s) => [
		s,
		{
			...s,
			id: crypto.randomUUID(),
			startedAt: s.endedAt,
			endedAt: s.endedAt.replace("12:10", "12:20"),
		},
	]);
	expect(
		summarizeReading(repeated, sessions, "UTC").remainingSeconds,
	).toBeGreaterThan(
		summarizeReading(segments, sessions, "UTC").remainingSeconds ?? 0,
	);
});

test("sparse manual entries never suppress observed time, records, or estimates", () => {
	const observed = Array.from({ length: 3 }, (_, i) =>
		segment({
			sessionId: `observed-${i}`,
			startedAt: `2026-01-0${i + 1}T12:00:00Z`,
			endedAt: `2026-01-0${i + 1}T12:10:00Z`,
		}),
	);
	const sessions = observed.map((s) => ({
		id: s.sessionId,
		mode: "automatic",
		contentVersion: "v1",
	}));
	const baseline = summarizeReading(observed, sessions, "UTC");
	for (const startedAt of ["11:00:00", "12:05:00", "13:00:00"]) {
		const result = summarizeReading(
			[
				...observed,
				segment({
					sessionId: "manual",
					kind: "manual",
					startedAt: `2026-01-03T${startedAt}Z`,
					endedAt: "2026-01-03T18:00:00Z",
					seconds: 60,
				}),
			],
			sessions,
			"UTC",
		);
		expect(result.totalSeconds).toBe(1860);
		expect(result.overlapSeconds).toBe(baseline.overlapSeconds);
		expect(result.longestSession).toEqual(baseline.longestSession);
		expect(result.bestDay).toEqual(baseline.bestDay);
		expect(result.remainingSeconds).toBe(baseline.remainingSeconds);
		expect(result.remainingSeconds).not.toBeNull();
	}
});

test("longest-session ties prefer the most recent session", () => {
	const result = summarizeReading(
		[
			segment(),
			segment({
				sessionId: "newer",
				startedAt: "2026-01-02T12:00:00Z",
				endedAt: "2026-01-02T12:10:00Z",
			}),
		],
		[],
		"UTC",
	);
	expect(result.longestSession).toEqual({ id: "newer", seconds: 600 });
});

test("instant navigation changes the day's final position without adding time", () => {
	const first = segment();
	const jump = segment({
		startedAt: first.endedAt,
		endedAt: first.endedAt,
		seconds: 0,
		startPosition: 0.12,
		endPosition: 0.75,
		kind: "jump",
	});
	const result = summarizeReading([first, jump], [], "UTC");
	expect(result.totalSeconds).toBe(600);
	expect(result.days[0]?.endPosition).toBe(0.75);
	expect(result.days[0]?.ranges.at(-1)?.kind).toBe("jump");
});

test("daily progress sums forward reading and ignores jumps", () => {
	const result = summarizeReading(
		[
			segment({ startPosition: 0.1, endPosition: 0.15 }),
			segment({
				startedAt: "2026-01-01T12:10:00Z",
				endedAt: "2026-01-01T12:10:00Z",
				seconds: 0,
				startPosition: 0.15,
				endPosition: 0.6,
				kind: "jump",
			}),
			segment({
				startedAt: "2026-01-01T12:20:00Z",
				endedAt: "2026-01-01T12:30:00Z",
				startPosition: 0.6,
				endPosition: 0.58,
			}),
		],
		[],
		"UTC",
	);
	expect(result.days[0]?.progress).toBeCloseTo(0.05);
});

test("progress across midnight is credited to the day the segment ends", () => {
	const result = summarizeReading(
		[
			segment({
				startedAt: "2026-01-01T23:50:00Z",
				endedAt: "2026-01-02T00:10:00Z",
				seconds: 1200,
				startPosition: 0.2,
				endPosition: 0.3,
			}),
		],
		[],
		"UTC",
	);
	expect(result.days[0]?.progress).toBe(0);
	expect(result.days[1]?.progress).toBeCloseTo(0.1);
});

test("speed is the median session rate and null without samples", () => {
	const segments = [0.01, 0.02, 0.03].map((advance, i) =>
		segment({
			sessionId: `s${i}`,
			startedAt: `2026-01-0${i + 1}T12:00:00Z`,
			endedAt: `2026-01-0${i + 1}T12:10:00Z`,
			startPosition: 0.1,
			endPosition: 0.1 + advance,
		}),
	);
	const sessions = segments.map((s) => ({
		id: s.sessionId,
		mode: "automatic",
		contentVersion: "v1",
	}));
	expect(summarizeReading(segments, sessions, "UTC").speed).toBeCloseTo(
		0.02 / 600,
	);
	expect(summarizeReading([], [], "UTC").speed).toBeNull();
});

test("manual progress is tracked apart from observed progress", () => {
	const result = summarizeReading(
		[
			segment({ startPosition: 0.1, endPosition: 0.15 }),
			segment({
				sessionId: "manual",
				kind: "manual",
				startedAt: "2026-01-01T18:00:00Z",
				endedAt: "2026-01-01T18:30:00Z",
				seconds: 1800,
				startPosition: 0.15,
				endPosition: 0.25,
			}),
		],
		[],
		"UTC",
	);
	expect(result.days[0]?.progress).toBeCloseTo(0.15);
	expect(result.days[0]?.manualProgress).toBeCloseTo(0.1);
});

test("estimate needs report the missing sessions and time until ready", () => {
	const segments = [0, 1].map((i) =>
		segment({
			sessionId: `s${i}`,
			startedAt: `2026-01-0${i + 1}T12:00:00Z`,
			endedAt: `2026-01-0${i + 1}T12:10:00Z`,
		}),
	);
	const sessions = segments.map((s) => ({
		id: s.sessionId,
		mode: "automatic",
		contentVersion: "v1",
	}));
	expect(summarizeReading(segments, sessions, "UTC").estimateNeeds).toEqual({
		sessions: 1,
		seconds: 600,
	});
	const third = segment({
		sessionId: "s2",
		startedAt: "2026-01-03T12:00:00Z",
		endedAt: "2026-01-03T12:10:00Z",
	});
	expect(
		summarizeReading(
			[...segments, third],
			[...sessions, { id: "s2", mode: "automatic", contentVersion: "v1" }],
			"UTC",
		).estimateNeeds,
	).toBeNull();
});

test("paces list each measured session in time order without outliers", () => {
	const advances = [0.02, 0.022, 0.018, 0.2];
	const segments = advances.map((advance, i) =>
		segment({
			sessionId: `s${i}`,
			startedAt: `2026-01-0${i + 1}T12:00:00Z`,
			endedAt: `2026-01-0${i + 1}T12:10:00Z`,
			startPosition: 0.1,
			endPosition: 0.1 + advance,
		}),
	);
	const sessions = segments
		.map((s) => ({ id: s.sessionId, mode: "automatic", contentVersion: "v1" }))
		.reverse();
	const { paces } = summarizeReading(segments, sessions, "UTC");
	expect(paces.map((p) => p.sessionId)).toEqual(["s0", "s1", "s2"]);
	expect(paces[0]).toMatchObject({
		startedAt: "2026-01-01T12:00:00.000Z",
		seconds: 600,
	});
	expect(paces[0]?.rate).toBeCloseTo(0.02 / 600);
});
test("listening sessions measure speed, even past the reading cap, and ignore seeks", () => {
	// A 20-minute audiobook at 2×: 0.0017 of the book per second, above the text cap.
	const sessions = ["a", "b", "c"].map((id) => ({
		id,
		contentVersion: "audio",
		mode: "automatic",
	}));
	const segments = sessions.flatMap((s, i) => {
		const day = `2026-01-0${i + 1}`;
		return [
			segment({
				sessionId: s.id,
				startedAt: `${day}T12:00:00Z`,
				endedAt: `${day}T12:10:00Z`,
				seconds: 600,
				startPosition: 0,
				endPosition: 1,
				kind: "listening",
			}),
			segment({
				sessionId: s.id,
				startedAt: `${day}T12:10:00Z`,
				endedAt: `${day}T12:10:00Z`,
				seconds: 0,
				startPosition: 1,
				endPosition: 0,
				kind: "jump",
			}),
		];
	});
	const result = summarizeReading(segments, sessions, "UTC");
	expect(result.speed).toBeCloseTo(1 / 600);
	expect(result.paces).toHaveLength(3);
	expect(result.totalSeconds).toBe(1800);
	expect(result.days.map((d) => d.progress)).toEqual([1, 1, 1]);
});
test("a later day start keeps a night past midnight on the evening's day", () => {
	// 23:30–01:30 in Bogotá (UTC-5) is one reading night when days start at 04:00.
	const night = segment({
		startedAt: "2026-01-03T04:30:00Z",
		endedAt: "2026-01-03T06:30:00Z",
		seconds: 7200,
	});
	expect(
		summarizeReading([night], [], "America/Bogota", 4).days.map((d) => d.day),
	).toEqual(["2026-01-02"]);
	expect(
		summarizeReading([night], [], "America/Bogota").days.map((d) => d.day),
	).toEqual(["2026-01-02", "2026-01-03"]);
});
test("with a day start the split falls at that hour, not midnight", () => {
	const parts = splitDays(
		Date.parse("2026-01-03T08:00:00Z"),
		Date.parse("2026-01-03T10:00:00Z"),
		"America/Bogota",
		4,
	);
	expect(parts.map((p) => [p.day, new Date(p.end).toISOString()])).toEqual([
		["2026-01-02", "2026-01-03T09:00:00.000Z"],
		["2026-01-03", "2026-01-03T10:00:00.000Z"],
	]);
});
