import { db } from "@nanahoshi-v2/db";
import {
	appSettings,
	discordAccessRule,
	invitationLink,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq } from "drizzle-orm";
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
 * the instance registration policy — with a usable invite link code
 * (Discord-style, via /invite/:code), through an enabled method, unless closed.
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

	// Policy/method denials don't depend on invite links — skip that lookup.
	const early = evaluateSignUpGate({
		...base,
		method: opts.method,
		inviteLink: null,
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

	// A usable link determines the invited server; a stale link must not
	// impose Discord requirements.
	const invitedServerId =
		inviteLink && isInviteLinkUsable(inviteLink) ? inviteLink.serverId : null;
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
	});
}
