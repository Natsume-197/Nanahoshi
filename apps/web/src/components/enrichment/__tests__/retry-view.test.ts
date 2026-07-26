import { describe, expect, test } from "bun:test";
import { resolveRetryView } from "../retry-view";

describe("resolveRetryView", () => {
	test("treats a cached pre-projection item as idle", () => {
		expect(() => resolveRetryView(undefined)).not.toThrow();
		expect(resolveRetryView(undefined)).toEqual({
			automaticRetryAt: null,
			automaticRetryScheduled: false,
			automaticRetryCancelled: false,
			providerRetryExhausted: false,
		});
	});

	test("projects a durable cancellation independently from exhaustion", () => {
		expect(
			resolveRetryView({
				state: "cancelled",
				nextRetryAt: null,
				attempts: 1,
				maxAttempts: 3,
			}),
		).toEqual({
			automaticRetryAt: null,
			automaticRetryScheduled: false,
			automaticRetryCancelled: true,
			providerRetryExhausted: false,
		});
	});
});
