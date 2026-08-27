import { describe, expect, test } from "bun:test";
import { resolveRailSection } from "../rail-nav";

describe("resolveRailSection", () => {
	test("home matches exactly, not as a prefix", () => {
		expect(resolveRailSection("/dashboard")).toBe("home");
		expect(resolveRailSection("/dashboard/series")).not.toBe("home");
	});

	test("all catalog formats share the catalog entry", () => {
		expect(resolveRailSection("/dashboard/books")).toBe("catalog");
		expect(resolveRailSection("/dashboard/audiobooks")).toBe("catalog");
		expect(resolveRailSection("/dashboard/read-listen")).toBe("catalog");
	});

	test("detail pages light the entry they belong to", () => {
		expect(resolveRailSection("/dashboard/books/abc-123")).toBe("catalog");
		expect(resolveRailSection("/dashboard/audiobooks/abc-123")).toBe("catalog");
		expect(resolveRailSection("/dashboard/audiobooks/series/abc-123")).toBe(
			"catalog",
		);
	});

	test("the facet pages sit under More", () => {
		expect(resolveRailSection("/dashboard/authors")).toBe("more");
		expect(resolveRailSection("/dashboard/narrators/x")).toBe("more");
		expect(resolveRailSection("/dashboard/publishers")).toBe("more");
	});

	test("the remaining rail destinations resolve to themselves", () => {
		expect(resolveRailSection("/dashboard/collections/x")).toBe("collections");
		expect(resolveRailSection("/dashboard/series/x")).toBe("series");
		expect(resolveRailSection("/dashboard/genres")).toBe("genres");
	});

	test("routes the rail doesn't own light nothing", () => {
		expect(resolveRailSection("/dashboard/libraries/abc-123")).toBeNull();
		expect(resolveRailSection("/dashboard/downloads")).toBeNull();
		expect(resolveRailSection("/dashboard/profile")).toBeNull();
	});
});
