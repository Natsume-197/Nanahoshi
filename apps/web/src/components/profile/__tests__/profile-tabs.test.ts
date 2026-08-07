import { describe, expect, it } from "bun:test";
import { parseRequestedProfileTab, resolveProfileTab } from "../profile-tabs";

describe("parseRequestedProfileTab", () => {
	it("accepts the tabs a URL can name", () => {
		expect(parseRequestedProfileTab("books")).toBe("books");
		expect(parseRequestedProfileTab("audiobooks")).toBe("audiobooks");
		expect(parseRequestedProfileTab("likes")).toBe("likes");
	});

	it("falls back to the overview for anything else", () => {
		// "overview" is the default, so it is not a value the URL carries.
		for (const value of ["overview", "", "Likes", 3, null, undefined, {}]) {
			expect(parseRequestedProfileTab(value)).toBeUndefined();
		}
	});
});

describe("resolveProfileTab", () => {
	it("defaults to the overview", () => {
		expect(
			resolveProfileTab({ requestedTab: undefined, isOwnProfile: true }),
		).toBe("overview");
		expect(
			resolveProfileTab({ requestedTab: undefined, isOwnProfile: false }),
		).toBe("overview");
	});

	it("opens the likes tab on your own profile", () => {
		expect(
			resolveProfileTab({ requestedTab: "likes", isOwnProfile: true }),
		).toBe("likes");
	});

	it("refuses the likes tab on someone else's profile", () => {
		// listLiked answers for the session user only, so honouring ?tab=likes
		// here would show the viewer their own likes under another name.
		expect(
			resolveProfileTab({ requestedTab: "likes", isOwnProfile: false }),
		).toBe("overview");
	});

	it("leaves the public shelf tabs alone for any viewer", () => {
		for (const tab of ["books", "audiobooks"] as const) {
			expect(
				resolveProfileTab({ requestedTab: tab, isOwnProfile: false }),
			).toBe(tab);
			expect(resolveProfileTab({ requestedTab: tab, isOwnProfile: true })).toBe(
				tab,
			);
		}
	});
});
