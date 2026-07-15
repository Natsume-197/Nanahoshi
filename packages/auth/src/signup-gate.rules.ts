/**
 * Pure decision logic for the email sign-up gate. Kept free of imports so it
 * can be unit-tested without touching the database.
 */

export type InviteLinkState = {
	revokedAt: Date | null;
	expiresAt: Date | null;
	maxUses: number | null;
	useCount: number;
};

export type SignUpGateInput = {
	/** Has first-setup completed? Before that, sign-up only happens via the setup wizard. */
	configured: boolean;
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

/** Sign-up is open before first setup, and invite-only afterwards. */
export function evaluateSignUpGate(input: SignUpGateInput): boolean {
	if (!input.configured) return true;
	if (input.hasPendingInvitation) return true;
	if (input.inviteLink && isInviteLinkUsable(input.inviteLink, input.now)) {
		return true;
	}
	return false;
}
