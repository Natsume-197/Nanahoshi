import { user } from "@nanahoshi-v2/db/schema/auth";
import { serverMemberProfile } from "@nanahoshi-v2/db/schema/general";
import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * Discord-style profile resolution: show the per-organization override if the
 * user set one for `serverId`, otherwise fall back to the global value on
 * the `user` table. Implemented as a correlated subquery so it can be dropped
 * into existing SELECTs (members, collections, search) without restructuring
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
	serverId?: string,
): SQL<string | null> {
	if (!serverId) {
		return sql<string | null>`${globalColumn}`;
	}
	return sql<
		string | null
	>`coalesce((SELECT ${column} FROM ${serverMemberProfile} WHERE ${serverMemberProfile.userId} = ${user.id} AND ${serverMemberProfile.serverId} = ${serverId}), ${globalColumn})`;
}

export function resolveAvatarSql(serverId?: string): SQL<string | null> {
	return resolveField(serverMemberProfile.image, user.image, serverId);
}

export function resolveBioSql(serverId?: string): SQL<string | null> {
	return resolveField(serverMemberProfile.bio, user.bio, serverId);
}

export function resolveHeaderSql(serverId?: string): SQL<string | null> {
	return resolveField(
		serverMemberProfile.headerImage,
		user.headerImage,
		serverId,
	);
}

/**
 * The *raw* per-org override value (NULL when none is set or no active org).
 * Lets the settings UI tell whether a field is overridden vs inherited from the
 * global account default, so it can offer a "use account default" reset.
 */
function overrideField(
	column: AnyPgColumn,
	serverId?: string,
): SQL<string | null> {
	if (!serverId) return sql<string | null>`NULL`;
	return sql<
		string | null
	>`(SELECT ${column} FROM ${serverMemberProfile} WHERE ${serverMemberProfile.userId} = ${user.id} AND ${serverMemberProfile.serverId} = ${serverId})`;
}

export function orgAvatarOverrideSql(serverId?: string): SQL<string | null> {
	return overrideField(serverMemberProfile.image, serverId);
}

export function orgBioOverrideSql(serverId?: string): SQL<string | null> {
	return overrideField(serverMemberProfile.bio, serverId);
}

export function orgHeaderOverrideSql(serverId?: string): SQL<string | null> {
	return overrideField(serverMemberProfile.headerImage, serverId);
}
