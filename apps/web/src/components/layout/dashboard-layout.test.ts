import { describe, expect, test } from "bun:test";
import {
	getRenderedDashboardRoute,
	isStandaloneDashboardRoute,
} from "./dashboard-route-presentation";

describe("dashboard standalone routes", () => {
	test("settings owns its navigation and hides the dashboard chrome", () => {
		expect(
			isStandaloneDashboardRoute("/dashboard/settings/appearance", {}),
		).toBe(true);
	});

	test("server settings owns its navigation and hides the dashboard chrome", () => {
		expect(isStandaloneDashboardRoute("/dashboard/server/general", {})).toBe(
			true,
		);
		expect(isStandaloneDashboardRoute("/dashboard/server", {})).toBe(true);
		expect(isStandaloneDashboardRoute("/dashboard", {})).toBe(false);
	});

	test("keeps chrome aligned with the route whose content is rendered", () => {
		const dashboard = { pathname: "/dashboard", search: {} };
		const settings = {
			pathname: "/dashboard/settings/appearance",
			search: {},
		};

		// Entering settings: the URL already targets settings, but dashboard is
		// still the leaf rendered by Outlet.
		expect(getRenderedDashboardRoute([dashboard], settings)).toEqual(dashboard);

		// Leaving settings: the URL already targets dashboard, but settings is
		// still the leaf rendered by Outlet.
		expect(getRenderedDashboardRoute([settings], dashboard)).toEqual(settings);
	});
});
