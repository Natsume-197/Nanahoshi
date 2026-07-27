import { describe, expect, test } from "bun:test";
import { activeTrayTotal, lifecycleNavCount } from "../nav-counts";

const counts = {
	in_progress: 3,
	attention: 5,
	stopped: 1,
	completed: 40,
	history: 12,
};

describe("activeTrayTotal", () => {
	test("sums every bucket except history", () => {
		// The root row opens the bucket-less list, which the server serves
		// without archived rows — the number has to describe that same list.
		expect(activeTrayTotal(counts)).toBe(49);
	});

	test("is undefined before the first response", () => {
		expect(activeTrayTotal(undefined)).toBeUndefined();
	});

	test("treats missing buckets as zero", () => {
		expect(activeTrayTotal({ attention: 2 })).toBe(2);
	});
});

describe("lifecycleNavCount", () => {
	test("reads a lifecycle from the lifecycle tally", () => {
		expect(lifecycleNavCount("no_match", counts, { no_match: 7 })).toBe(7);
	});

	test("reads archived from the history bucket instead", () => {
		// The lifecycle query excludes archived rows, so its tally never holds
		// an "archived" key and the row would read a permanent zero.
		expect(lifecycleNavCount("archived", counts, { no_match: 7 })).toBe(12);
	});

	test("is undefined when the tally has not arrived", () => {
		expect(lifecycleNavCount("running", undefined, undefined)).toBeUndefined();
	});
});
