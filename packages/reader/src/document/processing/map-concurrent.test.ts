import { describe, expect, test } from "bun:test";
import { mapConcurrent } from "./map-concurrent";

describe("mapConcurrent", () => {
	test("preserves input order while limiting active work", async () => {
		let active = 0;
		let peak = 0;
		const result = await mapConcurrent([1, 2, 3, 4], 2, async (value) => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 5 - value));
			active -= 1;
			return value * 2;
		});

		expect(result).toEqual([2, 4, 6, 8]);
		expect(peak).toBe(2);
	});
});
