import { describe, expect, it } from "bun:test";
import {
	getLocationRestoreKey,
	getRenderedLocationRestoreKey,
	getScrollRestoreEpoch,
	pageScroll,
	railScroll,
	readUiSnapshot,
	saveUiSnapshot,
} from "../scroll-restoration";

describe("getLocationRestoreKey", () => {
	it("prefers the TSR history key", () => {
		expect(
			getLocationRestoreKey({
				href: "/dashboard",
				state: { __TSR_key: "abc", key: "legacy", __TSR_index: 3 },
			}),
		).toBe("abc");
	});

	it("falls back to legacy key, then index:href, then href", () => {
		expect(
			getLocationRestoreKey({ href: "/a", state: { key: "legacy" } }),
		).toBe("legacy");
		expect(
			getLocationRestoreKey({ href: "/a", state: { __TSR_index: 2 } }),
		).toBe("2:/a");
		expect(getLocationRestoreKey({ href: "/a", state: {} })).toBe("/a");
	});
});

describe("getRenderedLocationRestoreKey", () => {
	it("keys off resolvedLocation while a navigation is pending", () => {
		// Pending nav: `location` already points at the target while the old
		// page (resolvedLocation) is still on screen — the key must not flip
		// early or the restorer remounts and scrolls the old page to top.
		expect(
			getRenderedLocationRestoreKey({
				resolvedLocation: { href: "/dashboard", state: { __TSR_key: "old" } },
				location: {
					href: "/dashboard/books/x",
					state: { __TSR_key: "new" },
				},
			}),
		).toBe("old");
	});

	it("falls back to location before the first resolution", () => {
		expect(
			getRenderedLocationRestoreKey({
				resolvedLocation: undefined,
				location: { href: "/dashboard", state: { __TSR_key: "first" } },
			}),
		).toBe("first");
	});
});

describe("getScrollRestoreEpoch", () => {
	const home = { href: "/dashboard", state: { __TSR_key: "home" } };
	const detail = { href: "/dashboard/books/x", state: { __TSR_key: "det" } };
	const homeMatches = [{ id: "/dashboard" }];
	const detailMatches = [{ id: "/dashboard" }, { id: "/dashboard/books/x" }];

	it("does not flip at navigation start (pending, old content on screen)", () => {
		const idle = getScrollRestoreEpoch({
			matches: homeMatches,
			resolvedLocation: home,
			location: home,
		});
		const pending = getScrollRestoreEpoch({
			matches: homeMatches,
			resolvedLocation: home,
			location: detail,
		});
		expect(pending).toBe(idle);
	});

	it("flips in the content-swap commit, before the location resolves", () => {
		const beforeSwap = getScrollRestoreEpoch({
			matches: homeMatches,
			resolvedLocation: home,
			location: detail,
		});
		const atSwap = getScrollRestoreEpoch({
			matches: detailMatches,
			resolvedLocation: home,
			location: detail,
		});
		expect(atSwap).not.toBe(beforeSwap);
	});

	it("flips again on resolution, covering same-route navigations", () => {
		const atSwap = getScrollRestoreEpoch({
			matches: detailMatches,
			resolvedLocation: home,
			location: detail,
		});
		const resolved = getScrollRestoreEpoch({
			matches: detailMatches,
			resolvedLocation: detail,
			location: detail,
		});
		expect(resolved).not.toBe(atSwap);
	});
});

describe("pageScroll", () => {
	it("stores and reads positions per key", () => {
		pageScroll.set("k1", 420);
		expect(pageScroll.get("k1")).toBe(420);
		expect(pageScroll.has("k1")).toBe(true);
		expect(pageScroll.get("missing")).toBeUndefined();
		expect(pageScroll.has("missing")).toBe(false);
	});

	it("evicts the oldest entry past the bound", () => {
		pageScroll.set("evict-first", 1);
		for (let i = 0; i < 210; i++) {
			pageScroll.set(`evict-${i}`, i);
		}
		expect(pageScroll.has("evict-first")).toBe(false);
		expect(pageScroll.get("evict-209")).toBe(209);
	});

	it("re-setting a key refreshes its eviction slot", () => {
		pageScroll.set("keep-me", 7);
		for (let i = 0; i < 150; i++) {
			pageScroll.set(`filler-a-${i}`, i);
		}
		pageScroll.set("keep-me", 8);
		for (let i = 0; i < 150; i++) {
			pageScroll.set(`filler-b-${i}`, i);
		}
		expect(pageScroll.get("keep-me")).toBe(8);
	});
});

describe("railScroll", () => {
	it("keys rails by location + rail id", () => {
		railScroll.set("loc1", "recs-books", 300);
		railScroll.set("loc1", "recs-audiobooks", 120);
		railScroll.set("loc2", "recs-books", 50);
		expect(railScroll.get("loc1", "recs-books")).toBe(300);
		expect(railScroll.get("loc1", "recs-audiobooks")).toBe(120);
		expect(railScroll.get("loc2", "recs-books")).toBe(50);
		expect(railScroll.get("loc3", "recs-books")).toBeUndefined();
	});
});

describe("ui snapshots", () => {
	it("round-trips arbitrary state per key", () => {
		saveUiSnapshot("loc1:lib", { sort: "title", search: "haruhi" });
		expect(
			readUiSnapshot<{ sort: string; search: string }>("loc1:lib"),
		).toEqual({ sort: "title", search: "haruhi" });
		expect(readUiSnapshot("loc-none")).toBeUndefined();
	});
});
