import { describe, expect, it } from "bun:test";
import { lifecycleNavCount } from "./nav-counts";

describe("lifecycleNavCount", () => {
	it("groups every match that needs human review", () => {
		expect(
			lifecycleNavCount("review", undefined, {
				review: 1,
				unresolved: 2,
				partial: 4,
			}),
		).toBe(7);
	});

	it("reads a lifecycle missing from loaded counts as zero", () => {
		expect(lifecycleNavCount("running", undefined, { done: 3 })).toBe(0);
	});

	it("stays unknown until counts load", () => {
		expect(lifecycleNavCount("running", undefined, undefined)).toBeUndefined();
	});
});
