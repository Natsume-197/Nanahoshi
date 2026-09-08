import { describe, expect, test } from "bun:test";
import type { SessionUpload } from "@nanahoshi-v2/api/routers/reading-sessions/reading-sessions.model";
import { SessionClock } from "./session-clock";

function fixture() {
	let ms = 0;
	const segments: SessionUpload["segments"] = [];
	const clock = new SessionClock(
		(s) => segments.push(s),
		() => ({ mono: ms, wall: Date.UTC(2026, 0, 1) + ms }),
	);
	return {
		clock,
		segments,
		advance: (n: number) => {
			ms += n;
		},
	};
}
describe("reading session clock", () => {
	test("a jump followed immediately by a tick retains its navigation event", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(1000);
		f.clock.move(0.75, true);
		f.clock.tick(5);
		expect(f.segments.at(-1)).toMatchObject({
			kind: "jump",
			seconds: 0,
			startPosition: 0.1,
			endPosition: 0.75,
		});
		expect(f.clock.seconds).toBe(1);
	});
	test("wall clock changes do not lose time or reorder persisted segments", () => {
		let mono = 0;
		let wall = Date.UTC(2026, 0, 1);
		const segments: SessionUpload["segments"] = [];
		const clock = new SessionClock(
			(s) => segments.push(s),
			() => ({ mono, wall }),
		);
		clock.start(0);
		mono += 10000;
		wall -= 3600000;
		clock.tick(5);
		mono += 10000;
		wall += 7200000;
		clock.finish();
		expect(clock.seconds).toBe(20);
		expect(segments.map((s) => s.seconds)).toEqual([10, 10]);
		expect(segments[0]?.startedAt).toBe(clock.startedAt);
		expect(segments[0]?.endedAt).toBe(segments[1]?.startedAt);
		expect(segments[1]?.endedAt).toBe("2026-01-01T00:00:20.000Z");
	});
	test("character progress excludes jumps and pauses but counts rereading", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.clock.move(0.11);
		f.clock.move(0.8, true);
		f.clock.move(0.81);
		f.clock.pause();
		f.clock.move(0.2);
		f.clock.resume();
		f.clock.move(0.21);
		expect(Math.round(f.clock.snapshot().observedProgress * 100000)).toBe(3000);
		f.clock.start(0.21);
		expect(f.clock.snapshot().observedProgress).toBe(0);
	});
	test("manual pause survives activity; resume excludes the entire absence", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(10000);
		f.clock.pause();
		f.advance(3600000);
		f.clock.activity("automatic");
		expect(f.clock.state).toBe("paused");
		expect(f.clock.stale()).toBe(false);
		f.clock.resume();
		f.advance(10000);
		f.clock.finish();
		expect(f.clock.seconds).toBe(20);
		expect(f.segments).toHaveLength(2);
	});
	test("a sleeping browser cannot charge hours on its next tick", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(10000);
		f.clock.tick(5);
		f.advance(3600000);
		f.clock.tick(5);
		expect(f.clock.seconds).toBe(10);
		expect(f.clock.state).toBe("paused");
	});
	test("normal activity resumes a short automatic pause", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(10000);
		f.clock.pause(false);
		f.advance(10000);
		f.clock.activity("automatic");
		expect(f.clock.state).toBe("active");
		f.advance(10000);
		f.clock.finish();
		expect(f.clock.seconds).toBe(20);
	});
	test("long absence needs a new session", () => {
		const f = fixture();
		f.clock.start(0);
		f.clock.pause(false);
		f.advance(31 * 60000);
		f.clock.activity("automatic");
		expect(f.clock.stale()).toBe(true);
		expect(f.clock.state).toBe("paused");
	});
	test("explicit navigation and backwards movement are separated from reading", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(10000);
		f.clock.move(0.12);
		f.clock.tick(5);
		f.advance(10000);
		f.clock.move(0.7, true);
		f.advance(10000);
		f.clock.tick(5);
		expect(f.segments.at(-1)?.kind).toBe("jump");
		expect(f.segments[0]?.endPosition).toBe(0.12);
	});
	test("idle timeout pauses without repeated charges", () => {
		const f = fixture();
		f.clock.start(0);
		for (let i = 0; i < 30; i++) {
			f.advance(10000);
			f.clock.tick(5);
		}
		expect(f.clock.state).toBe("paused");
		const before = f.clock.seconds;
		f.advance(60000);
		f.clock.tick(5);
		expect(f.clock.seconds).toBe(before);
	});
});

test("pause reasons preserve a manual pause and clear on resume", () => {
	const f = fixture();
	f.clock.start(0.1);
	f.clock.pause();
	f.clock.pause(false, true, "hidden");
	expect(f.clock.snapshot().pauseReason).toBe("manual");
	f.clock.resume();
	expect(f.clock.snapshot().pauseReason).toBeNull();
	f.clock.pause(false, true, "hidden");
	expect(f.clock.snapshot().pauseReason).toBe("hidden");
	f.clock.resume();
	f.advance(300_000);
	f.clock.tick(5);
	expect(f.clock.snapshot().pauseReason).toBe("idle");
});

test("the finished summary retains its final position while the reader navigates", () => {
	const f = fixture();
	f.clock.start(0.1);
	f.clock.move(0.12);
	f.clock.finish();
	f.clock.move(0.8, true);
	expect(f.clock.snapshot().position).toBe(0.12);
	f.clock.start(0.8);
	expect(f.clock.snapshot().startPosition).toBe(0.8);
});
