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
});
