import { describe, expect, test } from "bun:test";
import { resolveRailSection } from "../rail-nav";

describe("resolveRailSection", () => {
	test("home matches exactly, not as a prefix", () => {
		expect(resolveRailSection("/dashboard")).toBe("home");
		expect(resolveRailSection("/dashboard/")).toBe("home");
		expect(resolveRailSection("/dashboard/series")).not.toBe("home");
	});

	test("book and audiobook formats share the catalog entry", () => {
		expect(resolveRailSection("/dashboard/books")).toBe("catalog");
		expect(resolveRailSection("/dashboard/audiobooks")).toBe("catalog");
	});

	test("Read & Listen has its own sidebar entry", () => {
		expect(resolveRailSection("/dashboard/read-listen")).toBe("read-listen");
	});

	test("detail pages light the entry they belong to", () => {
		expect(resolveRailSection("/dashboard/books/abc-123")).toBe("catalog");
		expect(resolveRailSection("/dashboard/audiobooks/abc-123")).toBe("catalog");
		expect(resolveRailSection("/dashboard/audiobooks/series/abc-123")).toBe(
			"catalog",
		);
	});

	test("shelves and collections belong to the Collections group", () => {
		expect(resolveRailSection("/dashboard/collections")).toBe("my-library");
		expect(resolveRailSection("/dashboard/collections/x")).toBe("my-library");
		expect(resolveRailSection("/dashboard/shelves/reading")).toBe("my-library");
		expect(resolveRailSection("/dashboard/shelves/completed")).toBe(
			"my-library",
		);
	});

	test("the facet pages have their own entries", () => {
		expect(resolveRailSection("/dashboard/authors")).toBe("authors");
		expect(resolveRailSection("/dashboard/narrators/x")).toBe("narrators");
		expect(resolveRailSection("/dashboard/publishers")).toBe("publishers");
	});

	test("the remaining rail destinations resolve to themselves", () => {
		expect(resolveRailSection("/dashboard/series/x")).toBe("series");
		expect(resolveRailSection("/dashboard/genres")).toBe("genres");
	});

	test("routes the rail doesn't own light nothing", () => {
		expect(resolveRailSection("/dashboard/libraries/abc-123")).toBeNull();
		expect(resolveRailSection("/dashboard/downloads")).toBeNull();
		expect(resolveRailSection("/dashboard/profile")).toBeNull();
	});
});
