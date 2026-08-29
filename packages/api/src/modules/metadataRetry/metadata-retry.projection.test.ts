import { describe, expect, test } from "bun:test";
import { metadataRetryProjection } from "./metadata-retry.projection";

describe("metadata retry projection", () => {
	test("projects a scheduled retry without exposing provider error codes", () => {
		expect(
			metadataRetryProjection({
				nextRetryAt: "2026-07-22T21:00:00.000Z",
				providerAttempts: 1,
				hasFailures: true,
			}),
		).toEqual({
			state: "scheduled",
			nextRetryAt: "2026-07-22T21:00:00.000Z",
			attempts: 1,
			maxAttempts: 3,
		});
	});

	test("projects exhaustion only after the bounded provider-call budget", () => {
		expect(
			metadataRetryProjection({
				nextRetryAt: null,
				providerAttempts: 3,
				hasFailures: true,
			}).state,
		).toBe("exhausted");
	});
});
