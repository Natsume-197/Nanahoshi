import { describe, expect, test } from "bun:test";
import { inviteCodeFromOAuthState } from "../oauth-invite-state";

describe("inviteCodeFromOAuthState", () => {
	test("restores a valid invite code from OAuth state", () => {
		expect(inviteCodeFromOAuthState({ inviteCode: "8aDkwkE0m7" })).toBe(
			"8aDkwkE0m7",
		);
	});

	test("ignores missing or malformed invite codes", () => {
		expect(inviteCodeFromOAuthState(null)).toBeNull();
		expect(inviteCodeFromOAuthState({ inviteCode: 123 })).toBeNull();
		expect(inviteCodeFromOAuthState({ inviteCode: "has spaces" })).toBeNull();
		expect(inviteCodeFromOAuthState({ inviteCode: "x".repeat(65) })).toBeNull();
	});
});
