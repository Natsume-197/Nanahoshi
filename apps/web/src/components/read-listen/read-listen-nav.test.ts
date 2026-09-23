import { describe, expect, test } from "bun:test";
import { bucketLandingView } from "./read-listen-nav";

describe("bucketLandingView", () => {
	const attention = ["pending", "no_alignment", "failed", "unmatched"] as const;

	test("opens the first state in the bucket that has work", () => {
		expect(
			bucketLandingView([...attention], { pending: 0, no_alignment: 2 }),
		).toBe("no_alignment");
	});

	test("falls back to the first state when the bucket is empty", () => {
		expect(bucketLandingView([...attention], {})).toBe("pending");
	});
});
