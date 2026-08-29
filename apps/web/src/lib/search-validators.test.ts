import { describe, expect, it } from "bun:test";
import { optionalUuid } from "./search-validators";

describe("optionalUuid", () => {
	it("accepts canonical UUIDs", () => {
		expect(optionalUuid("1a0b9b2b-18fb-5df7-850b-447d94c2ea8c")).toBe(
			"1a0b9b2b-18fb-5df7-850b-447d94c2ea8c",
		);
	});

	it("drops malformed or non-string values", () => {
		expect(optionalUuid("not-a-uuid")).toBeUndefined();
		expect(optionalUuid(42)).toBeUndefined();
		expect(optionalUuid(undefined)).toBeUndefined();
	});
});
