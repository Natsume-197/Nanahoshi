import { describe, expect, test } from "bun:test";
import { MAX_SEEDS, type SignalRow, selectSeeds } from "../seed-selection";
import { workKey } from "../types";

const NOW = 1_750_000_000_000;
const DAY = 86_400_000;

describe("selectSeeds", () => {
	test("likes outweigh completions, completions outweigh shelf", () => {
		const rows: SignalRow[] = [
			{ key: workKey("series", 1), signal: "like", atMs: NOW },
			{ key: workKey("series", 2), signal: "completed", atMs: NOW },
			{ key: workKey("series", 3), signal: "shelf", atMs: NOW },
		];
		const { seeds } = selectSeeds(rows, NOW);
		expect(seeds.map((s) => s.key)).toEqual([
			"series:1",
			"series:2",
			"series:3",
		]);
	});

	test("recency decay: an old like can fall below a fresh completion", () => {
		const rows: SignalRow[] = [
			{ key: workKey("series", 1), signal: "like", atMs: NOW - 365 * DAY },
			{ key: workKey("series", 2), signal: "completed", atMs: NOW },
		];
		const { seeds } = selectSeeds(rows, NOW);
		expect(seeds[0]?.key).toBe("series:2");
	});

	test("max signal wins per work; fromLike sticks", () => {
		const rows: SignalRow[] = [
			{ key: workKey("series", 1), signal: "shelf", atMs: NOW },
			{ key: workKey("series", 1), signal: "like", atMs: NOW },
		];
		const { seeds } = selectSeeds(rows, NOW);
		expect(seeds.length).toBe(1);
		expect(seeds[0]?.weight).toBeCloseTo(1);
		expect(seeds[0]?.fromLike).toBe(true);
	});

	test("progress signal excludes but never seeds", () => {
		const rows: SignalRow[] = [
			{ key: workKey("book", 9), signal: "progress", atMs: NOW },
		];
		const { seeds, exclusions } = selectSeeds(rows, NOW);
		expect(seeds).toEqual([]);
		expect(exclusions.has("book:9")).toBe(true);
	});

	test("caps at MAX_SEEDS keeping the strongest", () => {
		const rows: SignalRow[] = Array.from({ length: 40 }, (_, i) => ({
			key: workKey("book", i + 1),
			signal: i < 25 ? ("like" as const) : ("shelf" as const),
			atMs: NOW - i * DAY,
		}));
		const { seeds, exclusions } = selectSeeds(rows, NOW);
		expect(seeds.length).toBe(MAX_SEEDS);
		expect(seeds.every((s) => s.weight > 0)).toBe(true);
		expect(exclusions.size).toBe(40);
	});

	test("empty input → no seeds, no exclusions, no error", () => {
		const { seeds, exclusions } = selectSeeds([], NOW);
		expect(seeds).toEqual([]);
		expect(exclusions.size).toBe(0);
	});

	test("deterministic tie order by key", () => {
		const rows: SignalRow[] = [
			{ key: workKey("book", 2), signal: "like", atMs: NOW },
			{ key: workKey("book", 1), signal: "like", atMs: NOW },
		];
		const a = selectSeeds(rows, NOW).seeds.map((s) => s.key);
		const b = selectSeeds([...rows].reverse(), NOW).seeds.map((s) => s.key);
		expect(a).toEqual(b);
	});

	test("not_interested is a negative seed, excluded, never positive", () => {
		const rows: SignalRow[] = [
			{ key: workKey("series", 5), signal: "not_interested", atMs: NOW },
		];
		const { seeds, negativeSeeds, exclusions } = selectSeeds(rows, NOW);
		expect(seeds).toEqual([]);
		expect(exclusions.has("series:5")).toBe(true);
		expect(negativeSeeds).toHaveLength(1);
		expect(negativeSeeds[0]?.key).toBe("series:5");
		expect(negativeSeeds[0]?.type).toBe("not_interested");
		expect(negativeSeeds[0]?.weight).toBeCloseTo(0.7);
	});

	test("abandoned is a weaker negative than not_interested", () => {
		const { negativeSeeds } = selectSeeds(
			[
				{ key: workKey("book", 1), signal: "not_interested", atMs: NOW },
				{ key: workKey("book", 2), signal: "abandoned", atMs: NOW },
			],
			NOW,
		);
		const notInterested = negativeSeeds.find((s) => s.key === "book:1");
		const abandoned = negativeSeeds.find((s) => s.key === "book:2");
		expect(notInterested?.weight).toBeCloseTo(0.7);
		expect(abandoned?.weight).toBeCloseTo(0.3);
	});

	test("negatives decay slower than positives (180d half-life)", () => {
		const { negativeSeeds } = selectSeeds(
			[
				{
					key: workKey("book", 1),
					signal: "not_interested",
					atMs: NOW - 180 * DAY,
				},
			],
			NOW,
		);
		// 0.7 * exp(-180/180) = 0.7 / e
		expect(negativeSeeds[0]?.weight).toBeCloseTo(0.7 / Math.E, 4);
	});

	test("an explicit negative overrides a positive signal on the same work", () => {
		const rows: SignalRow[] = [
			{ key: workKey("series", 7), signal: "like", atMs: NOW },
			{ key: workKey("series", 7), signal: "not_interested", atMs: NOW },
		];
		const { seeds, negativeSeeds } = selectSeeds(rows, NOW);
		expect(seeds.map((s) => s.key)).not.toContain("series:7");
		expect(negativeSeeds.map((s) => s.key)).toContain("series:7");
	});
});
