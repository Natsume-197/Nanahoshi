import { describe, expect, test } from "bun:test";
import { resolveLiveListeningPosition } from "./member-activity-progress";

describe("resolveLiveListeningPosition", () => {
	test("advances playback locally between presence heartbeats", () => {
		expect(
			resolveLiveListeningPosition({
				currentTimeSeconds: 105,
				durationSeconds: 217,
				updatedAt: 10_000,
				now: 13_400,
			}),
		).toBe(108);
	});

	test("uses the local receipt time when gateway and client clocks differ", () => {
		expect(
			resolveLiveListeningPosition({
				currentTimeSeconds: 105,
				durationSeconds: 217,
				updatedAt: 1_000,
				receivedAt: 10_000,
				now: 13_400,
			}),
		).toBe(108);
	});

	test("advances at the shared playback rate", () => {
		expect(
			resolveLiveListeningPosition({
				currentTimeSeconds: 105,
				durationSeconds: 217,
				updatedAt: 10_000,
				playbackRate: 1.5,
				now: 13_400,
			}),
		).toBe(110);
	});

	test("never advances beyond the audiobook duration", () => {
		expect(
			resolveLiveListeningPosition({
				currentTimeSeconds: 215,
				durationSeconds: 217,
				updatedAt: 10_000,
				now: 20_000,
			}),
		).toBe(217);
	});
});
