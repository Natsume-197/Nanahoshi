import { describe, expect, test } from "bun:test";
import { parseByteRange } from "./ranged-file";

describe("parseByteRange", () => {
	test("accepts bounded, open-ended, and suffix ranges", () => {
		expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
		expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
		expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
	});

	test("clamps an end beyond the file and rejects unsatisfied ranges", () => {
		expect(parseByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
		expect(parseByteRange("bytes=100-", 100)).toBe("invalid");
		expect(parseByteRange("items=0-1", 100)).toBe("invalid");
	});
});
