import { describe, expect, test } from "bun:test";
import type { SessionUpload } from "@nanahoshi/api/routers/reading-sessions/reading-sessions.model";
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
		expect(f.segments[0]?.endPosition).toBe(0.12);
		const jump = f.segments.find((s) => s.kind === "jump");
		expect(jump).toMatchObject({ startPosition: 0.12, endPosition: 0.7 });
		expect(jump?.seconds).toBe(0);
		// Time spent on the new page after the jump is reading there.
		expect(f.segments.at(-1)).toMatchObject({
			kind: "reading",
			startPosition: 0.7,
			seconds: 10,
		});
	});
	test("reading right after paging back is not filed as navigation", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(5000);
		f.clock.move(0.11);
		f.advance(300);
		f.clock.move(0.105);
		f.advance(300);
		f.clock.move(0.12);
		f.advance(5000);
		f.clock.tick(5);
		expect(
			f.segments.map((s) => [s.kind, s.startPosition, s.endPosition]),
		).toEqual([
			["reading", 0.1, 0.11],
			["jump", 0.11, 0.105],
			["reading", 0.105, 0.12],
		]);
	});
	test("paging back and forth only counts pages not read yet", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(1000);
		f.clock.move(0.11);
		f.advance(1000);
		f.clock.move(0.12);
		f.advance(1000);
		f.clock.move(0.11);
		f.advance(1000);
		f.clock.move(0.12);
		f.advance(1000);
		f.clock.move(0.13);
		expect(f.clock.observedProgress).toBeCloseTo(0.03);
	});
	test("history of the same run is not counted again; another run starts over", () => {
		const f = fixture();
		f.clock.cover("run-1", [[0, 0.2]]);
		f.clock.start(0.17);
		f.advance(1000);
		f.clock.move(0.19);
		f.advance(1000);
		f.clock.move(0.21);
		expect(f.clock.observedProgress).toBeCloseTo(0.01);
		f.clock.cover("run-2", []);
		f.advance(1000);
		f.clock.move(0.2);
		f.advance(1000);
		f.clock.move(0.22);
		expect(f.clock.observedProgress).toBeCloseTo(0.03);
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

describe("skimming", () => {
	// 100k characters: one page of 0.005 is 500 characters.
	function reading() {
		const f = fixture();
		f.clock.characterCount = 100_000;
		f.clock.start(0.1);
		f.advance(60_000);
		f.clock.move(0.105);
		return f;
	}
	const characters = (f: ReturnType<typeof fixture>) =>
		Math.round(f.clock.snapshot().observedProgress * 100_000);

	test("flicking ten pages ahead and back to the spot adds nothing", () => {
		const f = reading();
		for (let page = 1; page <= 10; page++) {
			f.advance(300);
			f.clock.move(0.105 + page * 0.005);
		}
		f.advance(500);
		f.clock.move(0.105, true);
		f.clock.tick(5);
		expect(characters(f)).toBe(500);
		expect(
			f.segments.filter(
				(s) =>
					s.kind === "reading" &&
					(s.startPosition ?? 0) >= 0.105 &&
					(s.endPosition ?? 0) > (s.startPosition ?? 0),
			),
		).toEqual([]);
	});

	test("skimmed pages count once they are actually read", () => {
		const f = reading();
		f.advance(300);
		f.clock.move(0.11);
		f.advance(300);
		f.clock.move(0.115);
		f.clock.move(0.105, true);
		f.advance(40_000);
		f.clock.move(0.11);
		f.advance(40_000);
		f.clock.move(0.115);
		expect(characters(f)).toBe(1500);
	});

	test("the first page turned after starting or resuming still counts", () => {
		const f = fixture();
		f.clock.characterCount = 100_000;
		f.clock.start(0.1);
		f.clock.move(0.105);
		f.clock.pause(false);
		f.clock.resume();
		f.clock.move(0.11);
		expect(characters(f)).toBe(1000);
	});

	test("scrolling a few lines in small steps after reading them counts in full", () => {
		const f = reading();
		f.advance(20_000);
		for (let step = 1; step <= 20; step++) {
			f.advance(16);
			f.clock.move(0.105 + step * 0.00002);
		}
		expect(characters(f)).toBe(540);
	});

	test("a burst after a long pause gets through only what was banked", () => {
		const f = reading();
		f.advance(120_000);
		// Ten 100-character pages, three seconds in all.
		for (let page = 1; page <= 10; page++) {
			f.advance(300);
			f.clock.move(0.105 + page * 0.001);
		}
		const burst = characters(f) - 500;
		expect(burst).toBeGreaterThan(0);
		expect(burst).toBeLessThanOrEqual(600 + 3 * 50);
	});

	test("a whole spread turned after reading it counts even past the bank limit", () => {
		const f = reading();
		f.advance(60_000);
		f.clock.move(0.125);
		expect(characters(f)).toBe(2500);
	});

	test("a book without a character count is never judged skimmed", () => {
		const f = fixture();
		f.clock.start(0.1);
		f.advance(60_000);
		f.clock.move(0.105);
		f.advance(100);
		f.clock.move(0.11);
		expect(Math.round(f.clock.snapshot().observedProgress * 1000)).toBe(10);
	});
});
