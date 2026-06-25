import { randomBytes } from "node:crypto";
import { db } from "@nanahoshi-v2/db";
import { account, member } from "@nanahoshi-v2/db/schema/auth";
import { memberRole, role } from "@nanahoshi-v2/db/schema/general";
import { env } from "@nanahoshi-v2/env/server";
import { and, eq } from "drizzle-orm";

/** No signature check needed: the token was just issued to us on the callback. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
	try {
		const part = token.split(".")[1];
		if (!part) return null;
		const json = Buffer.from(
			part.replace(/-/g, "+").replace(/_/g, "/"),
			"base64",
		).toString("utf8");
		return JSON.parse(json);
	} catch {
		return null;
	}
}

function parseRoleMap(): Record<string, string[]> {
	try {
		const raw = JSON.parse(env.OIDC_ROLE_MAP) as Record<
			string,
			string | string[]
		>;
		const out: Record<string, string[]> = {};
		for (const [group, value] of Object.entries(raw)) {
			out[group] = Array.isArray(value) ? value : [value];
		}
		return out;
	} catch {
		return {};
	}
}

function extractGroups(payload: Record<string, unknown> | null): string[] {
	if (!payload) return [];
	const raw = payload[env.OIDC_GROUPS_CLAIM];
	if (Array.isArray(raw))
		return raw.filter((g): g is string => typeof g === "string");
	if (typeof raw === "string") return raw.split(/[,\s]+/).filter(Boolean);
	return [];
}

/** Ensures org membership and reconciles roles from the IdP groups claim. Idempotent. */
export async function provisionOidcUser(userId: string): Promise<void> {
	if (!env.OIDC_ENABLED || !env.OIDC_AUTO_PROVISION) return;
	const organizationId = env.OIDC_DEFAULT_ORG_ID;
	if (!organizationId) return;

	const [existing] = await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		)
		.limit(1);
	if (!existing) {
		await db.insert(member).values({
			id: randomBytes(16).toString("hex"),
			userId,
			organizationId,
			role: "member",
			createdAt: new Date(),
		});
	}

	const roleMap = parseRoleMap();
	if (Object.keys(roleMap).length === 0) return;

	const [acct] = await db
		.select({ idToken: account.idToken })
		.from(account)
		.where(
			and(
				eq(account.userId, userId),
				eq(account.providerId, env.OIDC_PROVIDER_ID),
			),
		)
		.limit(1);
	if (!acct?.idToken) return;

	const groups = extractGroups(decodeJwtPayload(acct.idToken));
	const desiredRoleNames = new Set<string>();
	for (const g of groups) {
		for (const roleName of roleMap[g] ?? []) desiredRoleNames.add(roleName);
	}
	if (desiredRoleNames.size === 0) return;

	const orgRoles = await db
		.select({ id: role.id, name: role.name, isDefault: role.isDefault })
		.from(role)
		.where(eq(role.serverId, organizationId));
	const desiredRoleIds = orgRoles
		.filter((r) => !r.isDefault && desiredRoleNames.has(r.name))
		.map((r) => r.id);
	if (desiredRoleIds.length === 0) return;

	// Additive only: never strip locally-granted roles the IdP doesn't mention.
	const current = await db
		.select({ roleId: memberRole.roleId })
		.from(memberRole)
		.where(
			and(
				eq(memberRole.userId, userId),
				eq(memberRole.serverId, organizationId),
			),
		);
	const currentIds = new Set(current.map((c) => c.roleId));
	const toAdd = desiredRoleIds.filter((id) => !currentIds.has(id));
	if (toAdd.length > 0) {
		await db
			.insert(memberRole)
			.values(
				toAdd.map((roleId) => ({ userId, roleId, serverId: organizationId })),
			);
	}
}
