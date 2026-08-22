export type DiscordAccessRule = {
	guildId: string;
	roleId: string | null;
};

export type DiscordGuildMember = {
	roles?: string[];
};

/**
 * Discord rules are alternatives: a member needs to satisfy any one guild and
 * optional-role pair. Failed lookups deliberately do not grant access.
 */
export async function satisfiesDiscordAccessRules(
	rules: readonly DiscordAccessRule[],
	getGuildMember: (guildId: string) => Promise<DiscordGuildMember | null>,
): Promise<boolean> {
	if (rules.length === 0) return true;

	for (const rule of rules) {
		try {
			const member = await getGuildMember(rule.guildId);
			if (!member) continue;
			if (!rule.roleId || member.roles?.includes(rule.roleId)) return true;
		} catch {
			// An unavailable Discord response is an indeterminate result, never a
			// reason to create an account for a protected server.
		}
	}

	return false;
}
