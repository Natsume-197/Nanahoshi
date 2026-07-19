import { describe, expect, it } from "bun:test";
import {
	getMobileTabPressAction,
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
