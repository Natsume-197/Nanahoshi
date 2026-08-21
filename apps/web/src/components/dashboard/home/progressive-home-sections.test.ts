import { describe, expect, test } from "bun:test";
import {
	getHomePrefetchDistance,
	getHomePrioritySectionCount,
	getNextHomeSectionCount,
	getProgressiveHomePhase,
} from "./progressive-home-sections";

describe("getProgressiveHomePhase", () => {
	test("reserves four real section skeletons for the initial viewport", () => {
		expect(getHomePrioritySectionCount(10)).toBe(4);
		expect(getHomePrioritySectionCount(3)).toBe(3);
	});

	test("loads subsequent sections in batches of two", () => {
		expect(getNextHomeSectionCount(4, 10)).toBe(6);
		expect(getNextHomeSectionCount(9, 10)).toBe(10);
	});

	test("prefetches at least 1200px ahead and scales with tall viewports", () => {
		expect(getHomePrefetchDistance(720)).toBe(1200);
		expect(getHomePrefetchDistance(1080)).toBe(1620);
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

	test("waits for both members of a batch to settle", () => {
		expect(
			getProgressiveHomePhase({
				activeCount: 6,
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
				activeCount: 6,
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
