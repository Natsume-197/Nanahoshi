import { describe, expect, it } from "bun:test";
import {
	getMobileTabPressAction,
	getProfileTabPath,
	getTabReselectScrollBehavior,
} from "../mobile-tab-navigation";

describe("mobile tab navigation", () => {
	it("reselects an exact active tab", () => {
		expect(
			getMobileTabPressAction(
				"/dashboard/collections",
				"/dashboard/collections",
			),
		).toBe("reselect");
	});

	it("ignores a trailing slash when detecting reselection", () => {
		expect(
			getMobileTabPressAction("/dashboard/likes/", "/dashboard/likes"),
		).toBe("reselect");
	});

	it("navigates to the tab root from a nested route", () => {
		expect(
			getMobileTabPressAction(
				"/dashboard/collections/featured",
				"/dashboard/collections",
			),
		).toBe("navigate");
	});

	it("uses an instant scroll when reduced motion is requested", () => {
		expect(getTabReselectScrollBehavior(true)).toBe("auto");
		expect(getTabReselectScrollBehavior(false)).toBe("smooth");
	});
});

describe("getProfileTabPath", () => {
	it("points at the user's own profile", () => {
		expect(getProfileTabPath("natsume")).toBe("/dashboard/user/natsume");
	});

	it("falls back to the redirecting route without a username", () => {
		// /dashboard/profile resolves the username server-side and redirects, so
		// the tab still lands somewhere real while the session is thin.
		expect(getProfileTabPath(undefined)).toBe("/dashboard/profile");
		expect(getProfileTabPath(null)).toBe("/dashboard/profile");
		expect(getProfileTabPath("")).toBe("/dashboard/profile");
		expect(getProfileTabPath("   ")).toBe("/dashboard/profile");
	});

	it("reselects when already on the profile, so the tab scrolls to top", () => {
		const path = getProfileTabPath("natsume");

		expect(getMobileTabPressAction(path, path)).toBe("reselect");
		// A profile tab is a search param, so it must still count as the same page.
		expect(getMobileTabPressAction("/dashboard/user/natsume/", path)).toBe(
			"reselect",
		);
		expect(getMobileTabPressAction("/dashboard/user/otro", path)).toBe(
			"navigate",
		);
	});
});
