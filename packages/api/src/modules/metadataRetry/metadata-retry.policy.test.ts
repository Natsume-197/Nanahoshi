import { describe, expect, test } from "bun:test";
import {
	consumesProviderAttempt,
	MAX_PROVIDER_RETRY_ATTEMPTS,
} from "./metadata-retry.policy";

describe("metadata retry policy", () => {
	test("a cooldown gate check does not consume a provider call", () => {
		expect(
			consumesProviderAttempt([
				{ kind: "transient", code: "provider_cooldown" },
			]),
		).toBe(false);
	});

	test("a real transient provider failure consumes one call", () => {
		expect(
			consumesProviderAttempt([
				{ kind: "transient", code: "provider_unavailable" },
			]),
		).toBe(true);
		expect(MAX_PROVIDER_RETRY_ATTEMPTS).toBe(3);
	});

	test("permanent failures are not automatically retried", () => {
		expect(
			consumesProviderAttempt([
				{ kind: "permanent", code: "invalid_response" },
			]),
		).toBe(false);
	});
});
