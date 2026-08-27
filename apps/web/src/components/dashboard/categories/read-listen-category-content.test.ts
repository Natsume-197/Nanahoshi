import { describe, expect, test } from "bun:test";
import { partitionReadListenRails } from "./read-listen-rails";

const items = Array.from({ length: 20 }, (_, index) => ({
	id: `pair-${index + 1}`,
}));

describe("partitionReadListenRails", () => {
	test("keeps continue, recent, and available rails disjoint", () => {
		const activityById = new Map([
			["pair-2", 100],
			["pair-5", 200],
		]);
		const rails = partitionReadListenRails({
			items,
			activityById,
			limit: 12,
			recentLimit: 6,
		});

		expect(rails.continueItems.map((item) => item.id)).toEqual([
			"pair-5",
			"pair-2",
		]);
		expect(rails.recentItems).toHaveLength(6);
		expect(rails.availableItems).toHaveLength(12);
		expect(
			new Set(
				[
					...rails.continueItems,
					...rails.recentItems,
					...rails.availableItems,
				].map((item) => item.id),
			).size,
		).toBe(20);
	});

	test("does not invent empty rails for a small catalog", () => {
		const rails = partitionReadListenRails({
			items: items.slice(0, 4),
			activityById: new Map(),
			limit: 12,
			recentLimit: 6,
		});

		expect(rails.continueItems).toEqual([]);
		expect(rails.recentItems).toHaveLength(4);
		expect(rails.availableItems).toEqual([]);
	});
});
