import { describe, expect, test } from "bun:test";
import {
	DEFAULT_REGISTRATION_SETTINGS,
	evaluateSignUpGate,
	type InviteLinkState,
	isInviteLinkUsable,
	normalizeRegistrationSettings,
	type SignUpGateInput,
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

function gate(overrides: Partial<SignUpGateInput> = {}): SignUpGateInput {
	return {
		configured: true,
		policy: "invite-only",
		methodEnabled: true,
		method: "email",
		inviteLink: null,
		hasPendingInvitation: false,
		now: NOW,
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
			evaluateSignUpGate(
				gate({ configured: false, policy: "closed", methodEnabled: false }),
			),
		).toEqual({ allowed: true });
	});

	test("rejects sign-up after setup with no invitation of any kind", () => {
		expect(evaluateSignUpGate(gate())).toEqual({
			allowed: false,
			reason: "invite_required",
		});
	});

	test("allows sign-up with a usable invite link", () => {
		expect(evaluateSignUpGate(gate({ inviteLink: link() }))).toEqual({
			allowed: true,
		});
	});

	test("rejects sign-up with an unusable invite link", () => {
		expect(
			evaluateSignUpGate(gate({ inviteLink: link({ revokedAt: NOW }) })),
		).toEqual({ allowed: false, reason: "invite_required" });
	});

	test("allows sign-up with a pending email invitation", () => {
		expect(evaluateSignUpGate(gate({ hasPendingInvitation: true }))).toEqual({
			allowed: true,
		});
	});

	test("requires Discord OAuth for a Discord-gated invitation", () => {
		expect(
			evaluateSignUpGate(gate({ requiresDiscord: true, inviteLink: link() })),
		).toEqual({ allowed: false, reason: "discord_required" });

		expect(
			evaluateSignUpGate(
				gate({
					requiresDiscord: true,
					method: "discord",
					inviteLink: link(),
				}),
			),
		).toEqual({ allowed: true });
	});

	test("closed policy rejects even with a usable invite link", () => {
		expect(
			evaluateSignUpGate(
				gate({
					policy: "closed",
					inviteLink: link(),
					hasPendingInvitation: true,
				}),
			),
		).toEqual({ allowed: false, reason: "closed" });
	});

	test("disabled method rejects even with a usable invite link", () => {
		expect(
			evaluateSignUpGate(
				gate({
					methodEnabled: false,
					inviteLink: link(),
					hasPendingInvitation: true,
				}),
			),
		).toEqual({ allowed: false, reason: "method_disabled" });
	});

	test("closed wins over disabled method as the reported reason", () => {
		expect(
			evaluateSignUpGate(gate({ policy: "closed", methodEnabled: false })),
		).toEqual({ allowed: false, reason: "closed" });
	});
});

describe("normalizeRegistrationSettings", () => {
	test("returns defaults for missing value", () => {
		expect(normalizeRegistrationSettings(undefined)).toEqual(
			DEFAULT_REGISTRATION_SETTINGS,
		);
	});

	test("keeps a stored closed policy and method toggles", () => {
		expect(
			normalizeRegistrationSettings({
				policy: "closed",
				methods: { email: false, discord: true },
			}),
		).toEqual({ policy: "closed", methods: { email: false, discord: true } });
	});

	test("falls back to invite-only on unknown policy values", () => {
		expect(normalizeRegistrationSettings({ policy: "open" }).policy).toBe(
			"invite-only",
		);
	});

	test("missing method flags default to enabled", () => {
		expect(normalizeRegistrationSettings({ methods: {} }).methods).toEqual({
			email: true,
			discord: true,
		});
	});
});
