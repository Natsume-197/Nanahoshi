import { describe, expect, test } from "bun:test";
import type { RepresentativeRow } from "../recommendations.repository";
import {
	computeSessionBoost,
	emptyServingContext,
	filterFlatRows,
	isSuppressed,
	recencyDecay,
	rerankMixRows,
	type ServingContext,
	workKey,
} from "../rerank";

function row(overrides: Partial<RepresentativeRow> = {}): RepresentativeRow {
	return {
		kind: "book",
		itemId: 1,
		score: 0.5,
		reason: "similar_content",
		reasonTitle: null,
		mixIndex: 0,
		rank: 0,
		seriesUuid: null,
		seriesName: null,
		bookUuid: "b",
		bookTitle: "T",
		bookFilename: "t.epub",
		bookCover: null,
		bookMediaType: "ebook",
		authors: null,
		representativeCompleted: false,
		...overrides,
	};
}

function ctx(
	dismissed: string[] = [],
	sessionBoost: [string, number][] = [],
): ServingContext {
	return { dismissed: new Set(dismissed), sessionBoost: new Map(sessionBoost) };
}

describe("workKey", () => {
	test("stable kind:itemId form", () => {
		expect(workKey("series", 7)).toBe("series:7");
		expect(workKey("book", "9")).toBe("book:9");
	});
});

describe("isSuppressed", () => {
	test("completed shown volume is suppressed", () => {
		expect(isSuppressed(row({ representativeCompleted: true }), ctx())).toBe(
			true,
		);
	});

	test("dismissed work is suppressed", () => {
		expect(
			isSuppressed(row({ kind: "book", itemId: 9 }), ctx(["book:9"])),
		).toBe(true);
	});

	test("live, non-dismissed work is kept", () => {
		expect(
			isSuppressed(row({ kind: "book", itemId: 9 }), ctx(["book:8"])),
		).toBe(false);
	});

	test("dismiss is scoped by kind — same id, different kind is not suppressed", () => {
		expect(
			isSuppressed(row({ kind: "series", itemId: 9 }), ctx(["book:9"])),
		).toBe(false);
	});
});

describe("rerankMixRows", () => {
	test("empty context is a no-op except the per-mix cap", () => {
		const rows = [
			row({ mixIndex: 0, itemId: 1, bookUuid: "a" }),
			row({ mixIndex: 0, itemId: 2, bookUuid: "b" }),
		];
		expect(rerankMixRows(rows, emptyServingContext(), 15)).toEqual(rows);
	});

	test("drops suppressed rows and preserves input order", () => {
		const rows = [
			row({ mixIndex: 0, itemId: 1, bookUuid: "a" }),
			row({
				mixIndex: 0,
				itemId: 2,
				bookUuid: "done",
				representativeCompleted: true,
			}),
			row({ mixIndex: 0, itemId: 3, bookUuid: "c" }),
		];
		const out = rerankMixRows(rows, ctx(), 15);
		expect(out.map((r) => r.bookUuid)).toEqual(["a", "c"]);
	});

	test("caps per mix independently, filling from survivors", () => {
		const rows = [
			row({
				mixIndex: 0,
				itemId: 1,
				bookUuid: "x-done",
				representativeCompleted: true,
			}),
			row({ mixIndex: 0, itemId: 2, bookUuid: "x1" }),
			row({ mixIndex: 0, itemId: 3, bookUuid: "x2" }),
			row({ mixIndex: 0, itemId: 4, bookUuid: "x3" }),
			row({ mixIndex: 1, itemId: 5, bookUuid: "y1" }),
			row({ mixIndex: 1, itemId: 6, bookUuid: "y2" }),
		];
		const out = rerankMixRows(rows, ctx(), 2);
		expect(out.filter((r) => r.mixIndex === 0).map((r) => r.bookUuid)).toEqual([
			"x1",
			"x2",
		]);
		expect(out.filter((r) => r.mixIndex === 1).map((r) => r.bookUuid)).toEqual([
			"y1",
			"y2",
		]);
	});
});

describe("recencyDecay", () => {
	test("1 at age 0, halves each half-life, monotonic down", () => {
		expect(recencyDecay(0, 7)).toBe(1);
		expect(recencyDecay(7 * 86_400_000, 7)).toBeCloseTo(0.5, 5);
		expect(recencyDecay(14 * 86_400_000, 7)).toBeCloseTo(0.25, 5);
		expect(recencyDecay(365 * 86_400_000, 7)).toBeLessThan(0.001);
	});
});

describe("computeSessionBoost", () => {
	const now = 1_000_000_000_000;
	test("recent seed → full-strength boost on its similar candidates", () => {
		const boost = computeSessionBoost(
			[{ kind: "book", itemId: 99, atMs: now }],
			[
				{
					seedKind: "book",
					seedId: 99,
					candKind: "series",
					candId: 2,
					score: 0.8,
				},
			],
			now,
		);
		expect(boost.get("series:2")).toBeCloseTo(0.8, 5);
	});

	test("takes the max over seeds, not the sum", () => {
		const boost = computeSessionBoost(
			[
				{ kind: "book", itemId: 1, atMs: now },
				{ kind: "book", itemId: 2, atMs: now },
			],
			[
				{
					seedKind: "book",
					seedId: 1,
					candKind: "book",
					candId: 9,
					score: 0.3,
				},
				{
					seedKind: "book",
					seedId: 2,
					candKind: "book",
					candId: 9,
					score: 0.7,
				},
			],
			now,
		);
		expect(boost.get("book:9")).toBeCloseTo(0.7, 5);
	});

	test("old seed decays the boost toward zero", () => {
		const boost = computeSessionBoost(
			[{ kind: "book", itemId: 99, atMs: now - 365 * 86_400_000 }],
			[{ seedKind: "book", seedId: 99, candKind: "book", candId: 2, score: 1 }],
			now,
		);
		expect(boost.get("book:2") ?? 0).toBeLessThan(0.001);
	});

	test("similarities from unknown seeds are ignored", () => {
		const boost = computeSessionBoost(
			[{ kind: "book", itemId: 1, atMs: now }],
			[{ seedKind: "book", seedId: 42, candKind: "book", candId: 9, score: 1 }],
			now,
		);
		expect(boost.size).toBe(0);
	});
});

describe("rerankMixRows session boost", () => {
	test("boost overtakes a near-tie but respects a clear score gap", () => {
		const rows = [
			row({
				mixIndex: 0,
				kind: "book",
				itemId: 1,
				bookUuid: "top",
				score: 0.9,
				rank: 0,
			}),
			row({
				mixIndex: 0,
				kind: "book",
				itemId: 2,
				bookUuid: "low",
				score: 0.86,
				rank: 1,
			}),
		];
		// 0.86 + 0.08 = 0.94 > 0.90
		const boosted = rerankMixRows(rows, ctx([], [["book:2", 1]]), 15);
		expect(boosted.map((r) => r.bookUuid)).toEqual(["low", "top"]);
		// with a wide gap (0.90 vs 0.80) the same boost can't bridge it
		const wide = [
			row({
				mixIndex: 0,
				kind: "book",
				itemId: 1,
				bookUuid: "top",
				score: 0.9,
				rank: 0,
			}),
			row({
				mixIndex: 0,
				kind: "book",
				itemId: 2,
				bookUuid: "low",
				score: 0.8,
				rank: 1,
			}),
		];
		expect(
			rerankMixRows(wide, ctx([], [["book:2", 1]]), 15).map((r) => r.bookUuid),
		).toEqual(["top", "low"]);
	});
});

describe("filterFlatRows", () => {
	test("drops suppressed then caps to limit", () => {
		const rows = [
			row({ itemId: 1, bookUuid: "a" }),
			row({ itemId: 2, bookUuid: "gone", representativeCompleted: true }),
			row({ itemId: 3, bookUuid: "b" }),
			row({ itemId: 4, bookUuid: "c" }),
		];
		const out = filterFlatRows(rows, ctx(), 2);
		expect(out.map((r) => r.bookUuid)).toEqual(["a", "b"]);
	});
});
