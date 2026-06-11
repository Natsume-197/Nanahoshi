import { user } from "@nanahoshi-v2/db/schema/auth";
import { orgMemberProfile } from "@nanahoshi-v2/db/schema/general";
import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Discord-style profile resolution: show the per-organization override if the
 * user set one for `organizationId`, otherwise fall back to the global value on
 * the `user` table. Implemented as a correlated subquery so it can be dropped
 * into existing SELECTs (feeds, comments, followers) without restructuring
 * their joins — analogous to `firstAuthorNameSql` in profile.repository.ts.
 *
 * Every query that renders a user's avatar/bio/banner must use these so a user
 * appears with their *community* identity wherever they show up in that org.
 *
 * When no active org is provided, resolves to the global value directly.
 */
function resolveField(
	column: AnyPgColumn,
	globalColumn: AnyPgColumn,
	organizationId?: string,
): SQL<string | null> {
	if (!organizationId) {
		return sql<string | null>`${globalColumn}`;
	}
	return sql<
		string | null
	>`coalesce((SELECT ${column} FROM ${orgMemberProfile} WHERE ${orgMemberProfile.userId} = ${user.id} AND ${orgMemberProfile.organizationId} = ${organizationId}), ${globalColumn})`;
}

export function resolveAvatarSql(organizationId?: string): SQL<string | null> {
	return resolveField(orgMemberProfile.image, user.image, organizationId);
}

export function resolveBioSql(organizationId?: string): SQL<string | null> {
	return resolveField(orgMemberProfile.bio, user.bio, organizationId);
}

export function resolveHeaderSql(organizationId?: string): SQL<string | null> {
	return resolveField(
		orgMemberProfile.headerImage,
		user.headerImage,
		organizationId,
	);
}

/**
 * The *raw* per-org override value (NULL when none is set or no active org).
 * Lets the settings UI tell whether a field is overridden vs inherited from the
 * global account default, so it can offer a "use account default" reset.
 */
function overrideField(
	column: AnyPgColumn,
	organizationId?: string,
): SQL<string | null> {
	if (!organizationId) return sql<string | null>`NULL`;
	return sql<
		string | null
	>`(SELECT ${column} FROM ${orgMemberProfile} WHERE ${orgMemberProfile.userId} = ${user.id} AND ${orgMemberProfile.organizationId} = ${organizationId})`;
}

export function orgAvatarOverrideSql(
	organizationId?: string,
): SQL<string | null> {
	return overrideField(orgMemberProfile.image, organizationId);
}

export function orgBioOverrideSql(organizationId?: string): SQL<string | null> {
	return overrideField(orgMemberProfile.bio, organizationId);
}

export function orgHeaderOverrideSql(
	organizationId?: string,
): SQL<string | null> {
	return overrideField(orgMemberProfile.headerImage, organizationId);
}
