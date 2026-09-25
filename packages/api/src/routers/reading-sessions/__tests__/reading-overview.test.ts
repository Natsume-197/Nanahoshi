import { expect, test } from "bun:test";
import { type OverviewSegment, summarizeOverview } from "../reading-overview";

function segment(overrides: Partial<OverviewSegment> = {}): OverviewSegment {
	return {
		sessionId: "s1",
		book: 0,
		medium: "reading",
		characterCount: 100_000,
		startedAt: "2026-01-01T12:00:00Z",
		endedAt: "2026-01-01T12:10:00Z",
		seconds: 600,
		startPosition: 0.1,
		endPosition: 0.12,
		kind: "reading",
		...overrides,
	};
}
const listening = (overrides: Partial<OverviewSegment> = {}) =>
	segment({
		sessionId: "a1",
		book: 1,
		medium: "listening",
		characterCount: null,
		startPosition: 0.5,
		endPosition: 0.51,
		kind: "listening",
		...overrides,
	});

test("read & listen counts in both media but once in the total", () => {
	const { days } = summarizeOverview(
		[
			segment(),
			listening({
				startedAt: "2026-01-01T12:05:00Z",
				endedAt: "2026-01-01T12:15:00Z",
			}),
		],
		[],
		"UTC",
	);
	expect(days).toHaveLength(1);
	expect(days[0]).toMatchObject({
		readingSeconds: 600,
		listeningSeconds: 600,
		totalSeconds: 900,
		readingSessions: 1,
		listeningSessions: 1,
	});
});

test("characters come from forward progress, never from jumps or audio", () => {
	const { days, bookDays } = summarizeOverview(
		[
			segment(),
			segment({
				kind: "jump",
				startPosition: 0.12,
				endPosition: 0.5,
				startedAt: "2026-01-01T12:10:00Z",
				endedAt: "2026-01-01T12:10:01Z",
				seconds: 0,
			}),
			listening(),
		],
		[],
		"UTC",
	);
	expect(days[0]?.characters).toBe(2000);
	expect(bookDays.find((b) => b.book === 0)?.characters).toBe(2000);
	expect(bookDays.find((b) => b.book === 1)?.characters).toBe(0);
});

test("a night past midnight splits by the reader's day start", () => {
	const late = segment({
		startedAt: "2026-01-01T23:30:00Z",
		endedAt: "2026-01-02T00:30:00Z",
		seconds: 3600,
	});
	expect(summarizeOverview([late], [], "UTC").days.map((d) => d.day)).toEqual([
		"2026-01-01",
		"2026-01-02",
	]);
	const oneDay = summarizeOverview([late], [], "UTC", 4).days;
	expect(oneDay).toHaveLength(1);
	expect(oneDay[0]?.day).toBe("2026-01-01");
	expect(oneDay[0]?.readingSeconds).toBe(3600);
});

test("two devices on different books overlap once per medium", () => {
	const { days } = summarizeOverview(
		[
			segment(),
			segment({
				sessionId: "s2",
				book: 2,
				startedAt: "2026-01-01T12:05:00Z",
				endedAt: "2026-01-01T12:15:00Z",
			}),
		],
		[],
		"UTC",
	);
	expect(days[0]?.readingSeconds).toBe(900);
	expect(days[0]?.readingSessions).toBe(2);
});

test("manual sessions count time but not the clock habit, the pace or records", () => {
	const result = summarizeOverview(
		[
			segment({
				kind: "manual",
				seconds: 1800,
				endedAt: "2026-01-01T12:30:00Z",
			}),
		],
		[],
		"UTC",
	);
	expect(result.days[0]?.readingSeconds).toBe(1800);
	expect(result.weekHours.reading.reduce((a, b) => a + b, 0)).toBe(0);
	expect(result.days[0]?.speedSeconds).toBe(0);
	expect(result.longestSession.reading).toBeNull();
});

test("the week clock is local, Monday first, and pace inputs land per day", () => {
	// 2026-01-01T12:00Z is Thursday 21:00 in Tokyo.
	const result = summarizeOverview(
		[segment({ endedAt: "2026-01-01T12:20:00Z", seconds: 1200 })],
		[],
		"Asia/Tokyo",
	);
	expect(result.weekHours.reading[3 * 24 + 21]).toBe(1200);
	expect(result.days[0]).toMatchObject({
		speedSeconds: 1200,
		speedCharacters: 2000,
	});
});

test("the longest session sums its segments per medium", () => {
	const { longestSession } = summarizeOverview(
		[
			segment(),
			segment({
				startedAt: "2026-01-01T12:10:00Z",
				endedAt: "2026-01-01T12:30:00Z",
				seconds: 1200,
			}),
			segment({
				sessionId: "s2",
				book: 3,
				startedAt: "2026-01-02T12:00:00Z",
				endedAt: "2026-01-02T12:25:00Z",
				seconds: 1500,
			}),
			listening(),
		],
		[],
		"UTC",
	);
	expect(longestSession.reading).toEqual({
		seconds: 1800,
		book: 0,
		startedAt: "2026-01-01T12:00:00.000Z",
	});
	expect(longestSession.listening?.seconds).toBe(600);
});

test("finishes count on their local day and keep when the reading began", () => {
	const { days, finished } = summarizeOverview(
		[],
		[
			{
				book: 0,
				medium: "reading",
				startedAt: "2025-12-20T10:00:00Z",
				finishedAt: "2026-01-03T10:00:00Z",
			},
			{
				book: 1,
				medium: "listening",
				startedAt: null,
				finishedAt: "2026-01-03T11:00:00Z",
			},
		],
		"UTC",
	);
	expect(days).toEqual([
		expect.objectContaining({
			day: "2026-01-03",
			finishedReading: 1,
			finishedListening: 1,
		}),
	]);
	expect(finished[0]).toEqual({
		book: 0,
		medium: "reading",
		day: "2026-01-03",
		startedDay: "2025-12-20",
	});
});
