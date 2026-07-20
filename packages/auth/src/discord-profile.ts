type DiscordProfile = {
	id: string;
	username: string;
	global_name: string | null;
	discriminator: string;
};

/**
 * Map Discord's profile onto the fields required by the username plugin.
 * Modern Discord usernames (`discriminator === "0"`) are already unique, so
 * keep them clean. Legacy accounts retain their discriminator as a suffix.
 */
export function mapDiscordProfileToUser(profile: DiscordProfile) {
	const normalized = profile.username.toLowerCase().replace(/[^a-z0-9_.]/g, "");
	const legacySuffix =
		profile.discriminator && profile.discriminator !== "0"
			? `_${profile.discriminator.replace(/[^0-9]/g, "")}`
			: "";
	const fallbackId = profile.id.replace(/[^0-9]/g, "").slice(-8) || "discord";
	const preferredUsername = `${normalized}${legacySuffix}`;
	const username =
		normalized.length < 3
			? `user_${fallbackId}`
			: preferredUsername.length <= 30
				? preferredUsername
				: `${normalized.slice(0, 30 - fallbackId.length - 1)}_${fallbackId}`;

	return {
		username,
		displayUsername: profile.global_name?.trim() || profile.username,
	};
}
