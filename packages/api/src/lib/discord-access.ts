import { env } from "@nanahoshi-v2/env/server";
import { ForbiddenError, InternalServerError } from "../errors";
import { discordAccessRepository } from "./discord-access.repository";

/**
 * Attempts to refresh a Discord access token using the stored refresh token.
 * Returns the new access token and updates the DB record on success.
 * Throws if the refresh fails.
 */
async function refreshDiscordToken(
	accountId: string,
	refreshToken: string,
): Promise<string> {
	if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
		throw new InternalServerError(
			"Discord OAuth is not configured on the server.",
		);
	}

	const body = new URLSearchParams({
		client_id: env.DISCORD_CLIENT_ID,
		client_secret: env.DISCORD_CLIENT_SECRET,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	});

	const res = await fetch("https://discord.com/api/v10/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});

	if (!res.ok) {
		throw new ForbiddenError(
			"Your Discord session has expired. Please reconnect your Discord account in Account Settings → Connected Accounts.",
		);
	}

	const data = (await res.json()) as {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};

	// Persist the new tokens
	await discordAccessRepository.updateAccountTokens(accountId, {
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
	});

	return data.access_token;
}

/**
 * Checks whether a user satisfies the Discord access rules for an organization.
 * - If no rules are configured → access is free (returns without throwing)
 * - Each rule is: must be in guildId AND (optionally) have roleId
 * - Logic is OR: satisfying any one rule grants access
 * - Automatically refreshes expired Discord access tokens
 */
export async function checkDiscordAccess(
	userId: string,
	serverId: string,
): Promise<void> {
	// 1. Fetch all enabled rules for this org
	const rules = await discordAccessRepository.getEnabledRules(serverId);

	// No rules → open access
	if (rules.length === 0) return;

	// 2. Get the user's Discord account
	const discordAccount =
		await discordAccessRepository.getDiscordAccount(userId);

	if (!discordAccount?.accessToken) {
		throw new ForbiddenError(
			"You must link your Discord account to join this organization. Go to Account Settings → Connected Accounts.",
		);
	}

	let { accessToken } = discordAccount;
	const { id: accountId, refreshToken } = discordAccount;

	/**
	 * Calls Discord's guild member endpoint.
	 * If 401, attempts to refresh the token once.
	 * Returns the parsed member object or null (if not in guild).
	 */
	async function fetchGuildMember(
		guildId: string,
	): Promise<{ roles?: string[] } | null> {
		let res = await fetch(
			`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		);

		// Token expired — try to refresh
		if (res.status === 401 && refreshToken) {
			accessToken = await refreshDiscordToken(accountId, refreshToken);
			res = await fetch(
				`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`,
				{ headers: { Authorization: `Bearer ${accessToken}` } },
			);
		}

		if (res.status === 200) return res.json() as Promise<{ roles?: string[] }>;
		return null; // 404 = not in guild, other errors = treat as not in guild
	}

	// 3. Check each rule (OR logic — first match wins)
	for (const rule of rules) {
		try {
			const member = await fetchGuildMember(rule.guildId);
			if (!member) continue;
			if (!rule.roleId) return; // guild membership alone is enough
			if (member.roles?.includes(rule.roleId)) return; // has the required role
		} catch (err) {
			// Re-throw FORBIDDEN (token expired and refresh failed)
			if (err instanceof ForbiddenError) throw err;
			// Other errors (network, etc.) — try next rule
		}
	}

	// No rule was satisfied
	throw new ForbiddenError(
		"You don't meet the Discord requirements to join this organization. Make sure you're in the required Discord server and have the required role.",
	);
}
