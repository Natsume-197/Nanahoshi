import { describe, expect, test } from "bun:test";
import { authIpAddress, authRateLimit } from "../auth-security-options";

describe("auth security options", () => {
	test("uses the server-sanitized client IP for per-client rate limits", () => {
		expect(authIpAddress).toEqual({
			ipAddressHeaders: ["x-nanahoshi-client-ip"],
		});
	});

	test("does not rate-limit authenticated session reads", () => {
		expect(authRateLimit.customRules["/get-session"]).toBe(false);
		expect(authRateLimit.customRules["/organization/list"]).toBe(false);
		expect(
			authRateLimit.customRules["/organization/get-full-organization"],
		).toBe(false);
	});

	test("keeps credential endpoints rate-limited", () => {
		expect(authRateLimit.customRules["/sign-in/email"]).toEqual({
			window: 60,
			max: 5,
		});
		expect(authRateLimit.customRules["/reset-password"]).toEqual({
			window: 60,
			max: 5,
		});
	});
});
