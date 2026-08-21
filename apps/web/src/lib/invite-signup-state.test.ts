import { describe, expect, test } from "bun:test";
import { resolveInviteSignupState } from "./invite-signup-state";

describe("resolveInviteSignupState", () => {
	test("does not report registration as closed while settings are loading", () => {
		expect(resolveInviteSignupState(undefined)).toEqual({ status: "loading" });
	});

	test("offers every enabled registration method in invite-only mode", () => {
		expect(
			resolveInviteSignupState({
				policy: "invite-only",
				email: true,
				discord: true,
			}),
		).toEqual({ status: "available", email: true, discord: true });
	});

	test("reports registration as closed only when the server says so", () => {
		expect(
			resolveInviteSignupState({
				policy: "closed",
				email: true,
				discord: true,
			}),
		).toEqual({ status: "closed" });
	});

	test("reports registration as closed when no method is available", () => {
		expect(
			resolveInviteSignupState({
				policy: "invite-only",
				email: false,
				discord: false,
			}),
		).toEqual({ status: "closed" });
	});
});
