type InviteSignupSettings = {
	policy: "invite-only" | "closed";
	email: boolean;
	discord: boolean;
};

export type InviteSignupState =
	| { status: "loading" }
	| { status: "closed" }
	| { status: "available"; email: boolean; discord: boolean };

/**
 * Keep an unresolved public-settings request distinct from a genuinely closed
 * instance. Invite pages otherwise flash a false "not accepting accounts"
 * warning while that independent request is still in flight.
 */
export function resolveInviteSignupState(
	settings: InviteSignupSettings | undefined,
): InviteSignupState {
	if (!settings) return { status: "loading" };
	if (settings.policy === "closed" || (!settings.email && !settings.discord)) {
		return { status: "closed" };
	}
	return {
		status: "available",
		email: settings.email,
		discord: settings.discord,
	};
}
