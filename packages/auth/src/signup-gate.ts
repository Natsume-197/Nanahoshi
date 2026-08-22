import { db } from "@nanahoshi-v2/db";
import { invitation } from "@nanahoshi-v2/db/schema/auth";
import {
	appSettings,
	discordAccessRule,
	invitationLink,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, gt } from "drizzle-orm";
import {
	getRegistrationSettings,
	type SignUpMethod,
} from "./registration-settings";
import {
	evaluateSignUpGate,
	isInviteLinkUsable,
	type SignUpVerdict,
} from "./signup-gate.rules";

/**
 * Decides whether a sign-up may proceed: always before first setup (the setup
 * wizard creates the admin through the same endpoint), afterwards according to
 * the instance registration policy — with a usable invite link code or a
 * pending email invitation, through an enabled method, unless closed.
 */
export async function checkSignUp(opts: {
	email?: string;
	inviteCode?: string | null;
	method: SignUpMethod;
}): Promise<SignUpVerdict> {
	const [setting] = await db
		.select({ value: appSettings.value })
		.from(appSettings)
		.where(eq(appSettings.key, "first_setup"))
		.limit(1);
	const configured = setting?.value === true;
	if (!configured) return { allowed: true };

	const registration = await getRegistrationSettings();
	const base = {
		configured,
		policy: registration.policy,
		methodEnabled: registration.methods[opts.method],
	};

	// Policy/method denials don't depend on invitations — skip those lookups.
	const early = evaluateSignUpGate({
		...base,
		method: opts.method,
		inviteLink: null,
		hasPendingInvitation: false,
	});
	if (!early.allowed && early.reason !== "invite_required") return early;

	let inviteLink = null;
	if (opts.inviteCode) {
		const [link] = await db
			.select({
				revokedAt: invitationLink.revokedAt,
				expiresAt: invitationLink.expiresAt,
				maxUses: invitationLink.maxUses,
				useCount: invitationLink.useCount,
				serverId: invitationLink.serverId,
			})
			.from(invitationLink)
			.where(eq(invitationLink.code, opts.inviteCode))
			.limit(1);
		inviteLink = link ?? null;
	}

	let pendingInvitationServerId: string | null = null;
	if (opts.email) {
		const [pending] = await db
			.select({ organizationId: invitation.organizationId })
			.from(invitation)
			.where(
				and(
					eq(invitation.email, opts.email),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date()),
				),
			)
			.limit(1);
		pendingInvitationServerId = pending?.organizationId ?? null;
	}

	// Match the existing gate's precedence: a pending direct invitation is the
	// credential when present; otherwise a usable link is. An unrelated stale
	// link must not make another invitation require Discord.
	const invitedServerId =
		pendingInvitationServerId ??
		(inviteLink && isInviteLinkUsable(inviteLink) ? inviteLink.serverId : null);
	let requiresDiscord = false;
	if (invitedServerId) {
		const [rule] = await db
			.select({ id: discordAccessRule.id })
			.from(discordAccessRule)
			.where(
				and(
					eq(discordAccessRule.serverId, invitedServerId),
					eq(discordAccessRule.enabled, true),
				),
			)
			.limit(1);
		requiresDiscord = Boolean(rule);
	}

	return evaluateSignUpGate({
		...base,
		method: opts.method,
		requiresDiscord,
		inviteLink,
		hasPendingInvitation: Boolean(pendingInvitationServerId),
	});
}
