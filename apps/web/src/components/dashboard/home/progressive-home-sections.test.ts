import { describe, expect, test } from "bun:test";
import {
	getHomePrefetchDistance,
	getHomePrioritySectionCount,
	getNextHomeSectionCount,
	getOrderedVisibleSectionIds,
	getProgressiveHomePhase,
} from "./progressive-home-sections";

describe("getProgressiveHomePhase", () => {
	test("does not reveal a later carousel before earlier carousels settle", () => {
		expect(
			getOrderedVisibleSectionIds(["recently-added", "book-series"], {
				"book-series": "populated",
			}),
		).toEqual([]);

		expect(
			getOrderedVisibleSectionIds(["recently-added", "book-series"], {
				"recently-added": "empty",
				"book-series": "populated",
			}),
		).toEqual(["book-series"]);
	});
	test("reserves four real section skeletons for the initial viewport", () => {
		expect(getHomePrioritySectionCount(10)).toBe(4);
		expect(getHomePrioritySectionCount(3)).toBe(3);
	});

	test("loads subsequent sections in batches of three", () => {
		expect(getNextHomeSectionCount(4, 10)).toBe(7);
		expect(getNextHomeSectionCount(9, 10)).toBe(10);
	});

	test("adapts prefetch distance to viewport and connection quality", () => {
		expect(getHomePrefetchDistance(720)).toBe(3200);
		expect(getHomePrefetchDistance(1080)).toBe(4320);
		expect(getHomePrefetchDistance(720, { effectiveType: "3g" })).toBe(2000);
		expect(getHomePrefetchDistance(1080, { effectiveType: "2g" })).toBe(1350);
		expect(getHomePrefetchDistance(720, { saveData: true })).toBe(800);
		expect(getHomePrefetchDistance(720, { scrollVelocity: 1.5 })).toBe(4700);
		expect(
			getHomePrefetchDistance(720, {
				effectiveType: "3g",
				scrollVelocity: 3,
			}),
		).toBe(3080);
		expect(
			getHomePrefetchDistance(720, { saveData: true, scrollVelocity: 3 }),
		).toBe(800);
	});

	test("waits for the viewport before querying the next section", () => {
		expect(
			getProgressiveHomePhase({
				activeCount: 4,
				totalCount: 10,
				priorityCount: 4,
				lastStatus: "populated",
				hasPendingDeferred: false,
			}),
		).toBe("waiting-for-viewport");
	});

	test("waits for every member of a batch to settle", () => {
		expect(
			getProgressiveHomePhase({
				activeCount: 7,
				totalCount: 10,
				priorityCount: 4,
				lastStatus: "populated",
				hasPendingDeferred: true,
			}),
		).toBe("loading");
	});

	test("prefetches the next batch after populated or empty sections settle", () => {
		expect(
			getProgressiveHomePhase({
				activeCount: 7,
				totalCount: 10,
				priorityCount: 4,
				lastStatus: "empty",
				hasPendingDeferred: false,
			}),
		).toBe("waiting-for-viewport");
	});

	test("finishes when the final deferred section is empty", () => {
		expect(
			getProgressiveHomePhase({
				activeCount: 10,
				totalCount: 10,
				priorityCount: 4,
				lastStatus: "empty",
				hasPendingDeferred: false,
			}),
		).toBe("complete");
	});

	test("keeps loading while the first viewport skeletons resolve", () => {
		expect(
			getProgressiveHomePhase({
				activeCount: 4,
				totalCount: 10,
				priorityCount: 4,
				lastStatus: "loading",
				hasPendingDeferred: false,
			}),
		).toBe("loading");
	});
});
