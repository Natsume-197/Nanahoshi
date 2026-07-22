import { describe, expect, test } from "bun:test";
import { comparePresenceRows, type PresenceState } from "../presence.types";

const row = (state: PresenceState, name: string) => ({ state, name });

describe("comparePresenceRows", () => {
	test("orders by state weight: activity, online, away, offline", () => {
		const sorted = [
			row("offline", "a"),
			row("away", "a"),
			row("online", "a"),
			row("listening", "a"),
			row("reading", "a"),
		].sort(comparePresenceRows);
		expect(sorted.map((r) => r.state)).toEqual([
			"listening",
			"reading",
			"online",
			"away",
			"offline",
		]);
	});

	test("breaks state ties by name, case-insensitively", () => {
		const sorted = [
			row("online", "charlie"),
			row("online", "Alice"),
			row("online", "bob"),
		].sort(comparePresenceRows);
		expect(sorted.map((r) => r.name)).toEqual(["Alice", "bob", "charlie"]);
	});

	test("is deterministic regardless of locale conventions", () => {
		// localeCompare would treat these differently across locales; the shared
		// comparator must not, so server and client sorts always agree.
		expect(comparePresenceRows(row("online", "äbc"), row("online", "z"))).toBe(
			1,
		);
		expect(
			comparePresenceRows(row("online", "same"), row("online", "SAME")),
		).toBe(0);
	});
});
