import { describe, expect, test } from "bun:test";
import { normalizeTagNames } from "../../../../utils/normalizeTagNames";

// The tag upsert/link SQL in both metadata repositories delegates its input
// shaping to this pure helper; the repository modules themselves are mocked
// by several other test files in the shared bun process, so the normalization
// contract is pinned here instead.
describe("normalizeTagNames", () => {
	test("lowercases so provider vocabularies dedupe", () => {
		expect(normalizeTagNames(["Isekai", "isekai", "LitRPG"])).toEqual([
			"isekai",
			"litrpg",
		]);
	});

	test("trims whitespace and drops empty entries", () => {
		expect(normalizeTagNames(["  dark ", "", "   "])).toEqual(["dark"]);
	});

	test("dedupes after trimming and lowercasing", () => {
		expect(
			normalizeTagNames([" Villainess", "villainess ", "OP protagonist"]),
		).toEqual(["op protagonist", "villainess"]);
	});

	test("sorts for a consistent row-lock order across concurrent jobs", () => {
		expect(normalizeTagNames(["reincarnation", "harem", "isekai"])).toEqual([
			"harem",
			"isekai",
			"reincarnation",
		]);
	});

	test("returns [] for empty input", () => {
		expect(normalizeTagNames([])).toEqual([]);
	});
});
