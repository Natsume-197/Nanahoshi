import { describe, expect, it } from "bun:test";
import { shouldSkipReaderPrefetch } from "./prefetch";

describe("reader prefetch policy", () => {
	it("allows prefetch when the browser exposes no connection constraint", () => {
		expect(shouldSkipReaderPrefetch(undefined)).toBe(false);
	});

	it("honours Data Saver", () => {
		expect(shouldSkipReaderPrefetch({ saveData: true })).toBe(true);
	});

	it("avoids large prefetches on 2G connections", () => {
		expect(shouldSkipReaderPrefetch({ effectiveType: "slow-2g" })).toBe(true);
		expect(shouldSkipReaderPrefetch({ effectiveType: "2g" })).toBe(true);
		expect(shouldSkipReaderPrefetch({ effectiveType: "3g" })).toBe(false);
	});
});
