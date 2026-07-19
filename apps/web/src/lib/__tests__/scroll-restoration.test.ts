import { describe, expect, it } from "bun:test";
import {
	getLocationRestoreKey,
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
