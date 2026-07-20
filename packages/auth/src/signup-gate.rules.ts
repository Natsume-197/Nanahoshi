/**
 * Pure decision logic for the sign-up gate. Kept free of imports so it
 * can be unit-tested without touching the database.
 */

export type RegistrationPolicy = "invite-only" | "closed";

export type SignUpMethod = "email" | "discord";

export type RegistrationSettings = {
	policy: RegistrationPolicy;
	methods: Record<SignUpMethod, boolean>;
};

export const DEFAULT_REGISTRATION_SETTINGS: RegistrationSettings = {
	policy: "invite-only",
	methods: { email: true, discord: true },
};

/** Tolerates missing/partial stored values so new fields default safely. */
export function normalizeRegistrationSettings(
	value: unknown,
): RegistrationSettings {
	const raw = (value ?? {}) as {
		policy?: unknown;
		methods?: { email?: unknown; discord?: unknown };
	};
	return {
		policy: raw.policy === "closed" ? "closed" : "invite-only",
		methods: {
			email: raw.methods?.email !== false,
			discord: raw.methods?.discord !== false,
		},
	};
}

export type SignUpDenialReason =
	| "closed"
	| "method_disabled"
	| "invite_required";

export type SignUpVerdict =
	| { allowed: true }
	| { allowed: false; reason: SignUpDenialReason };

export type InviteLinkState = {
	revokedAt: Date | null;
	expiresAt: Date | null;
	maxUses: number | null;
	useCount: number;
};

export type SignUpGateInput = {
	/** Has first-setup completed? Before that, sign-up only happens via the setup wizard. */
	configured: boolean;
	/** Instance registration policy: invite-only accepts invited users, closed accepts nobody. */
	policy: RegistrationPolicy;
	/** Is the sign-up method being used (email, Discord, …) enabled for registration? */
	methodEnabled: boolean;
	/** The invite link matching the code the client presented, if any. */
	inviteLink: InviteLinkState | null;
	/** Does a pending (unexpired) email invitation exist for this email? */
	hasPendingInvitation: boolean;
	now?: Date;
};

export function isInviteLinkUsable(
	link: InviteLinkState,
	now: Date = new Date(),
): boolean {
	if (link.revokedAt) return false;
	if (link.expiresAt && link.expiresAt < now) return false;
	if (link.maxUses !== null && link.useCount >= link.maxUses) return false;
	return true;
}

/**
 * Sign-up is open before first setup; afterwards the instance policy and the
 * method toggle gate it, and invite-only requires an invitation of some kind.
 */
export function evaluateSignUpGate(input: SignUpGateInput): SignUpVerdict {
	if (!input.configured) return { allowed: true };
	if (input.policy === "closed") return { allowed: false, reason: "closed" };
	if (!input.methodEnabled) {
		return { allowed: false, reason: "method_disabled" };
	}
	if (input.hasPendingInvitation) return { allowed: true };
	if (input.inviteLink && isInviteLinkUsable(input.inviteLink, input.now)) {
		return { allowed: true };
	}
	return { allowed: false, reason: "invite_required" };
}
