import { describe, expect, test } from "bun:test";
import {
	getActiveHomeSectionCount,
	getHomePrefetchDistance,
	getHomePrioritySectionCount,
	getNextHomeSectionCount,
	getOrderedVisibleSectionIds,
	getProgressiveHomePhase,
	getProgressiveHomeSectionHidden,
} from "./progressive-home-sections";

describe("getProgressiveHomeSectionHidden", () => {
	test("removes empty section wrappers from the layout", () => {
		expect(getProgressiveHomeSectionHidden(false, true, "empty")).toBe(true);
	});

	test("keeps populated sections visible", () => {
		expect(getProgressiveHomeSectionHidden(false, true, "populated")).toBe(
			false,
		);
	});

	test("keeps unrevealed deferred sections hidden", () => {
		expect(getProgressiveHomeSectionHidden(true, false, "loading")).toBe(true);
	});
});

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

describe("getActiveHomeSectionCount", () => {
	// Default layout order.
	const sectionIds = [
		"continue",
		"recently-added",
		"books-for-you",
		"audiobooks-for-you",
		"popular",
		"your-collections",
		"book-series",
		"audiobook-series",
		"random-books",
		"random-audiobooks",
	] as const;

	test("backfills every empty section in the first viewport", () => {
		// A brand new account: nothing in progress and no recommendations yet.
		expect(
			getActiveHomeSectionCount({
				sectionIds,
				statuses: {
					continue: "empty",
					"recently-added": "populated",
					"books-for-you": "empty",
					"audiobooks-for-you": "empty",
				},
				rawActiveCount: 4,
				priorityCount: 4,
			}),
		).toBe(7);
	});

	test("never shrinks below the revealed batch or past the layout", () => {
		expect(
			getActiveHomeSectionCount({
				sectionIds,
				statuses: { continue: "empty" },
				rawActiveCount: 7,
				priorityCount: 4,
			}),
		).toBe(7);
		expect(
			getActiveHomeSectionCount({
				sectionIds: sectionIds.slice(0, 5),
				statuses: {
					continue: "empty",
					"books-for-you": "empty",
					"audiobooks-for-you": "empty",
				},
				rawActiveCount: 4,
				priorityCount: 4,
			}),
		).toBe(5);
	});
});
