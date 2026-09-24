import { expect, test } from "bun:test";
import type { SessionUpload } from "@nanahoshi/api/routers/reading-sessions/reading-sessions.model";
import { ListeningClock, RESUME_WINDOW_MS } from "./listening-clock";

type Segment = SessionUpload["segments"][number];
const DURATION = 1000;

function setup() {
	let mono = 0;
	const segments: Segment[] = [];
	let n = 0;
	const clock = new ListeningClock(
		(s) => segments.push(s),
		() => ({ mono, wall: Date.parse("2026-01-01T12:00:00Z") + mono }),
		() => `s${++n}`,
	);
	const at = (time: number, rate = 1) => ({ time, duration: DURATION, rate });
	// Advances wall time and plays audio at `rate` in one-second samples.
	const play = (seconds: number, from: number, rate = 1) => {
		for (let i = 1; i <= seconds; i++) {
			mono += 1000;
			clock.sample(at(from + i * rate, rate));
		}
		return from + seconds * rate;
	};
	return {
		clock,
		segments,
		at,
		play,
		wait: (ms: number) => {
			mono += ms;
		},
	};
}

test("counts real time at the playback rate and flushes every 30 s", () => {
	const { clock, segments, at, play } = setup();
	clock.start(at(100, 1.5));
	const end = play(40, 100, 1.5);
	clock.pause(at(end, 1.5));
	expect(clock.seconds).toBeCloseTo(40);
	expect(segments.map((s) => s.kind)).toEqual(["listening", "listening"]);
	expect(segments[0]?.seconds).toBeCloseTo(30);
	expect(segments[0]?.startPosition).toBeCloseTo(0.1);
	expect(segments[0]?.endPosition).toBeCloseTo(0.145);
	expect(segments[1]?.endPosition).toBeCloseTo(0.16);
});

test("a seek closes the listened part and records the jump", () => {
	const { clock, segments, at, play } = setup();
	clock.start(at(0));
	play(10, 0);
	// The sample that lands after the seek only detects it.
	play(1, 500);
	const end = play(5, 501);
	clock.pause(at(end));
	expect(segments.map((s) => s.kind)).toEqual([
		"listening",
		"jump",
		"listening",
	]);
	expect(segments[1]).toMatchObject({
		seconds: 0,
		startPosition: 0.01,
		endPosition: 0.501,
	});
	expect(segments[0]?.seconds).toBeCloseTo(10);
});

test("a stall adds no time", () => {
	const { clock, at, wait } = setup();
	clock.start(at(0));
	for (let i = 0; i < 20; i++) {
		wait(1000);
		clock.sample(at(0));
	}
	expect(clock.seconds).toBe(0);
});

test("a frozen tab credits only the audio that kept playing", () => {
	const { clock, segments, at, wait } = setup();
	clock.start(at(0));
	wait(600_000);
	clock.sample(at(120));
	clock.pause(at(120));
	expect(clock.seconds).toBeCloseTo(120);
	expect(segments[0]?.seconds).toBeCloseTo(120);
	expect(segments[0]?.endPosition).toBeCloseTo(0.12);
});

test("resuming after moving the playhead while paused records a jump", () => {
	const { clock, segments, at, play } = setup();
	clock.start(at(0));
	play(5, 0);
	clock.pause(at(5));
	clock.resume(at(300));
	play(5, 300);
	clock.finish(at(305));
	expect(segments.map((s) => s.kind)).toEqual([
		"listening",
		"jump",
		"listening",
	]);
	expect(clock.state).toBe("finished");
});

test("a pause becomes stale after the resume window", () => {
	const { clock, at, wait } = setup();
	clock.start(at(0));
	clock.pause(at(0));
	wait(RESUME_WINDOW_MS - 1);
	expect(clock.stale()).toBe(false);
	wait(1);
	expect(clock.stale()).toBe(true);
});

test("segment durations never exceed their wall span", () => {
	const { clock, segments, at, play } = setup();
	clock.start(at(0, 2));
	const end = play(45, 0, 2);
	clock.finish(at(end, 2));
	for (const s of segments)
		expect(s.seconds).toBeLessThanOrEqual(
			(Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000 + 1e-9,
		);
});
