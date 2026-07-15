import { describe, expect, test } from "bun:test";
import {
	evaluateSignUpGate,
	type InviteLinkState,
	isInviteLinkUsable,
} from "../signup-gate.rules";

const NOW = new Date("2026-07-15T12:00:00Z");

function link(overrides: Partial<InviteLinkState> = {}): InviteLinkState {
	return {
		revokedAt: null,
		expiresAt: null,
		maxUses: null,
		useCount: 0,
		...overrides,
	};
}

describe("isInviteLinkUsable", () => {
	test("accepts a plain link with no limits", () => {
		expect(isInviteLinkUsable(link(), NOW)).toBe(true);
	});

	test("rejects a revoked link", () => {
		expect(isInviteLinkUsable(link({ revokedAt: NOW }), NOW)).toBe(false);
	});

	test("rejects an expired link", () => {
		expect(
			isInviteLinkUsable(
				link({ expiresAt: new Date("2026-07-14T12:00:00Z") }),
				NOW,
			),
		).toBe(false);
	});

	test("accepts a link expiring in the future", () => {
		expect(
			isInviteLinkUsable(
				link({ expiresAt: new Date("2026-07-16T12:00:00Z") }),
				NOW,
			),
		).toBe(true);
	});

	test("rejects an exhausted link", () => {
		expect(isInviteLinkUsable(link({ maxUses: 3, useCount: 3 }), NOW)).toBe(
			false,
		);
	});

	test("accepts a link with uses remaining", () => {
		expect(isInviteLinkUsable(link({ maxUses: 3, useCount: 2 }), NOW)).toBe(
			true,
		);
	});
});

describe("evaluateSignUpGate", () => {
	test("always allows sign-up before first setup", () => {
		expect(
			evaluateSignUpGate({
				configured: false,
				inviteLink: null,
				hasPendingInvitation: false,
			}),
		).toBe(true);
	});

	test("rejects sign-up after setup with no invitation of any kind", () => {
		expect(
			evaluateSignUpGate({
				configured: true,
				inviteLink: null,
				hasPendingInvitation: false,
			}),
		).toBe(false);
	});

	test("allows sign-up with a usable invite link", () => {
		expect(
			evaluateSignUpGate({
				configured: true,
				inviteLink: link(),
				hasPendingInvitation: false,
				now: NOW,
			}),
		).toBe(true);
	});

	test("rejects sign-up with an unusable invite link", () => {
		expect(
			evaluateSignUpGate({
				configured: true,
				inviteLink: link({ revokedAt: NOW }),
				hasPendingInvitation: false,
				now: NOW,
			}),
		).toBe(false);
	});

	test("allows sign-up with a pending email invitation", () => {
		expect(
			evaluateSignUpGate({
				configured: true,
				inviteLink: null,
				hasPendingInvitation: true,
			}),
		).toBe(true);
	});
});
