import { describe, expect, test } from "bun:test";
import { isStandaloneDashboardRoute } from "./dashboard-route-presentation";

// Standalone routes drop the app chrome — the navbar, rail and announcement bar.
describe("isStandaloneDashboardRoute", () => {
	test("settings, server settings and the metadata manager own the window", () => {
		for (const path of [
			"/dashboard/settings",
			"/dashboard/settings/announcements",
			"/dashboard/server",
			"/dashboard/server/general",
			"/dashboard/metadata",
		]) {
			expect(isStandaloneDashboardRoute(path, {})).toBe(true);
		}
	});

	test("regular dashboard pages keep the chrome", () => {
		for (const path of [
			"/dashboard",
			"/dashboard/books/abc",
			"/dashboard/search",
			"/dashboard/stats",
		]) {
			expect(isStandaloneDashboardRoute(path, {})).toBe(false);
		}
	});

	test("Read & Listen is standalone only while reviewing matches", () => {
		expect(isStandaloneDashboardRoute("/dashboard/read-listen", {})).toBe(
			false,
		);
		expect(
			isStandaloneDashboardRoute("/dashboard/read-listen", {
				review: "matches",
			}),
		).toBe(true);
	});
});
