import { describe, expect, test } from "bun:test";
import {
	normalizeCatalogSearchQuery,
	normalizeNameSearchQuery,
} from "../name-search";

describe("normalizeNameSearchQuery", () => {
	test("folds width, case, whitespace, and typographic separators", () => {
		expect(normalizeNameSearchQuery("  Ｊｏｈｎ―Doe  ")).toBe("johndoe");
		expect(normalizeNameSearchQuery("John─Doe")).toBe("johndoe");
	});
});

describe("normalizeCatalogSearchQuery", () => {
	test("turns equivalent title separators into word boundaries", () => {
		expect(normalizeCatalogSearchQuery("86―エイティシックス―")).toBe(
			"86 エイティシックス",
		);
		expect(normalizeCatalogSearchQuery("86─エイティシックス─")).toBe(
			"86 エイティシックス",
		);
	});
});
