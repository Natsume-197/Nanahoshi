import { describe, expect, test } from "bun:test";
import {
	getHomeProgressiveSnapshot,
	reportHomeSectionStatus,
	revealNextHomeSectionBatch,
} from "./home-progressive-state";

describe("home progressive state restoration", () => {
	test("restores revealed sections after the dashboard remounts", () => {
		const locationKey = "dashboard-history-entry";

		expect(getHomeProgressiveSnapshot(locationKey)).toEqual({
			rawActiveCount: 4,
			statuses: {},
		});

		reportHomeSectionStatus(locationKey, "popular", "populated");
		revealNextHomeSectionBatch(locationKey, 10);
		revealNextHomeSectionBatch(locationKey, 10);

		// A new dashboard mount reads the same history entry synchronously.
		expect(getHomeProgressiveSnapshot(locationKey)).toEqual({
			rawActiveCount: 8,
			statuses: { popular: "populated" },
		});
	});

	test("does not leak progress into a new dashboard history entry", () => {
		expect(getHomeProgressiveSnapshot("different-history-entry")).toEqual({
			rawActiveCount: 4,
			statuses: {},
		});
	});
});
