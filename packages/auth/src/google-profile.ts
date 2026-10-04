type GoogleProfile = {
	sub: string;
	email: string;
	name?: string | null;
	given_name?: string | null;
};

/**
 * Map Google's profile onto the fields the username plugin requires. Google
 * has no handle, so the username comes from the email's local part, made
 * unique with the tail of the stable account id.
 */
export function mapGoogleProfileToUser(profile: GoogleProfile) {
	const local = (profile.email.split("@")[0] ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9_.]/g, "");
	const suffix = profile.sub.replace(/[^0-9a-z]/gi, "").slice(-6) || "google";
	const base =
		local.length >= 3 ? local.slice(0, 30 - suffix.length - 1) : "user";
	return {
		username: `${base}_${suffix}`.toLowerCase(),
		displayUsername:
			profile.name?.trim() || profile.given_name?.trim() || local || "user",
	};
}
