import { describe, expect, test } from "bun:test";
import { getHomeSectionPlaceholderKind } from "./home-section-placeholder-kind";

describe("getHomeSectionPlaceholderKind", () => {
	test("preserves the geometry of each deferred dashboard section", () => {
		expect(getHomeSectionPlaceholderKind("continue")).toBe("resume");
		expect(getHomeSectionPlaceholderKind("your-collections")).toBe(
			"collections",
		);
		expect(getHomeSectionPlaceholderKind("audiobooks-for-you")).toBe("square");
		expect(getHomeSectionPlaceholderKind("audiobook-series")).toBe("square");
		expect(getHomeSectionPlaceholderKind("random-audiobooks")).toBe("square");
		expect(getHomeSectionPlaceholderKind("books-for-you")).toBe("book");
		expect(getHomeSectionPlaceholderKind("popular")).toBe("book");
	});
});
