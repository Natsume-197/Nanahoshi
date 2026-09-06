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
