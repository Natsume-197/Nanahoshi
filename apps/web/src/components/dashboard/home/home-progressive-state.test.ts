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
			rawActiveCount: 10,
			statuses: { popular: "populated" },
		});
	});

	test("advances past sections already pulled in by the empty backfill", () => {
		const locationKey = "new-account-history-entry";

		// A new account has no continue list and no recommendations, so the
		// backfill already renders 7 sections while the raw count is still 4.
		revealNextHomeSectionBatch(locationKey, 10, 7);

		expect(getHomeProgressiveSnapshot(locationKey).rawActiveCount).toBe(10);
	});

	test("does not leak progress into a new dashboard history entry", () => {
		expect(getHomeProgressiveSnapshot("different-history-entry")).toEqual({
			rawActiveCount: 4,
			statuses: {},
		});
	});
});
