import { describe, expect, test } from "bun:test";
import {
	arrangeRailEntries,
	emptyRailLibraryLayout,
	moveRailEntry,
	normalizeRailLibraryLayout,
	toggleRailPin,
} from "./rail-library-layout";

const entries = (...keys: string[]) => keys.map((key) => ({ key }));
const keysOf = (list: { key: string }[]) => list.map((entry) => entry.key);

describe("normalizeRailLibraryLayout", () => {
	test("falls back to empty for junk", () => {
		expect(normalizeRailLibraryLayout(null)).toEqual(emptyRailLibraryLayout);
		expect(normalizeRailLibraryLayout("x")).toEqual(emptyRailLibraryLayout);
		expect(normalizeRailLibraryLayout({ order: "a" })).toEqual(
			emptyRailLibraryLayout,
		);
	});

	test("drops non-strings and duplicates", () => {
		expect(
			normalizeRailLibraryLayout({ order: ["a", 1, "b", "a"], pinned: ["b"] }),
		).toEqual({ order: ["a", "b"], pinned: ["b"] });
	});
});

describe("arrangeRailEntries", () => {
	test("keeps the default order without a saved layout", () => {
		const { pinned, rest } = arrangeRailEntries(
			entries("a", "b", "c"),
			emptyRailLibraryLayout,
		);
		expect(pinned).toEqual([]);
		expect(keysOf(rest)).toEqual(["a", "b", "c"]);
	});

	test("follows the saved order and splits out pinned entries", () => {
		const { pinned, rest } = arrangeRailEntries(entries("a", "b", "c", "d"), {
			order: ["d", "c", "b", "a"],
			pinned: ["b"],
		});
		expect(keysOf(pinned)).toEqual(["b"]);
		expect(keysOf(rest)).toEqual(["d", "c", "a"]);
	});

	test("puts entries the layout has never seen first", () => {
		const { rest } = arrangeRailEntries(entries("a", "new1", "b", "new2"), {
			order: ["b", "a"],
			pinned: [],
		});
		expect(keysOf(rest)).toEqual(["new1", "new2", "b", "a"]);
	});
});

describe("moveRailEntry", () => {
	test("moves an entry onto another's slot", () => {
		const layout = moveRailEntry(
			emptyRailLibraryLayout,
			["a", "b", "c"],
			"a",
			"c",
		);
		expect(layout.order).toEqual(["b", "c", "a"]);
	});

	test("keeps keys this server doesn't show", () => {
		const layout = moveRailEntry(
			{ order: ["other", "a", "b"], pinned: ["other"] },
			["a", "b"],
			"b",
			"a",
		);
		expect(layout).toEqual({ order: ["b", "a", "other"], pinned: ["other"] });
	});

	test("is a no-op for unknown or identical keys", () => {
		const layout = { order: ["a", "b"], pinned: [] };
		expect(moveRailEntry(layout, ["a", "b"], "a", "a")).toBe(layout);
		expect(moveRailEntry(layout, ["a", "b"], "a", "zzz")).toBe(layout);
	});
});

describe("toggleRailPin", () => {
	test("pinning puts the entry at the top of the pinned group", () => {
		const start = { order: ["a", "b", "c"], pinned: ["a"] };
		const layout = toggleRailPin(start, ["a", "b", "c"], "c");
		expect(layout.pinned).toEqual(["c", "a"]);
		const { pinned, rest } = arrangeRailEntries(entries("a", "b", "c"), layout);
		expect(keysOf(pinned)).toEqual(["c", "a"]);
		expect(keysOf(rest)).toEqual(["b"]);
	});

	test("unpinning puts the entry at the top of the rest", () => {
		const start = { order: ["a", "b", "c"], pinned: ["a"] };
		const layout = toggleRailPin(start, ["a", "b", "c"], "a");
		expect(layout.pinned).toEqual([]);
		const { rest } = arrangeRailEntries(entries("a", "b", "c"), layout);
		expect(keysOf(rest)).toEqual(["a", "b", "c"]);
	});

	test("unpinned entries keep their positions when something is pinned", () => {
		const layout = toggleRailPin(
			emptyRailLibraryLayout,
			["a", "b", "c", "d"],
			"c",
		);
		const { rest } = arrangeRailEntries(entries("a", "b", "c", "d"), layout);
		expect(keysOf(rest)).toEqual(["a", "b", "d"]);
	});
});
