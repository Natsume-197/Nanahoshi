import { db } from "@nanahoshi-v2/db";
import { invitation } from "@nanahoshi-v2/db/schema/auth";
import { appSettings, invitationLink } from "@nanahoshi-v2/db/schema/general";
import { and, eq, gt } from "drizzle-orm";
import { evaluateSignUpGate } from "./signup-gate.rules";

/**
 * Decides whether an email sign-up may proceed: always before first setup
 * (the setup wizard creates the admin through the same endpoint), afterwards
 * only with a usable invite link code or a pending email invitation.
 */
export async function isSignUpAllowed(opts: {
	email?: string;
	inviteCode?: string | null;
}): Promise<boolean> {
	const [setting] = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, "first_setup"))
		.limit(1);
	const configured = setting?.value === true;
	if (!configured) return true;

	let inviteLink = null;
	if (opts.inviteCode) {
		const [link] = await db
			.select({
				revokedAt: invitationLink.revokedAt,
				expiresAt: invitationLink.expiresAt,
				maxUses: invitationLink.maxUses,
				useCount: invitationLink.useCount,
			})
			.from(invitationLink)
			.where(eq(invitationLink.code, opts.inviteCode))
			.limit(1);
		inviteLink = link ?? null;
	}

	let hasPendingInvitation = false;
	if (opts.email) {
		const [pending] = await db
			.select({ id: invitation.id })
			.from(invitation)
			.where(
				and(
					eq(invitation.email, opts.email),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date()),
				),
			)
			.limit(1);
		hasPendingInvitation = Boolean(pending);
	}

	return evaluateSignUpGate({ configured, inviteLink, hasPendingInvitation });
}
