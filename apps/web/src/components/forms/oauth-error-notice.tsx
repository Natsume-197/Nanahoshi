import { m } from "@/paraglide/messages";

/**
 * OAuth callback failures arrive as a `?error=<code>` redirect (better-auth
 * snake-cases whatever message the server hook threw). Map the codes our
 * sign-up gate emits — plus the provider-side cancel — to readable text.
 */
const OAUTH_ERROR_MESSAGES: Record<string, () => string> = {
	invite_required: m["auth.oauth_err.invite_required"],
	signup_closed: m["auth.oauth_err.signup_closed"],
	signup_method_disabled: m["auth.oauth_err.method_disabled"],
	unable_to_get_user_info: m["auth.oauth_err.discord_access_required"],
	access_denied: m["auth.oauth_err.cancelled"],
	account_not_linked: m["auth.oauth_err.account_not_linked"],
	account_already_linked_to_different_user:
		m["auth.oauth_err.account_already_linked"],
};

export function oauthErrorMessage(code: string): string {
	const known = OAUTH_ERROR_MESSAGES[code];
	return known ? known() : m["auth.oauth_err.generic"]({ code });
}

export function OAuthErrorNotice({ code }: { code?: string }) {
	if (!code) return null;
	return (
		<div
			role="alert"
			className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm"
		>
			{oauthErrorMessage(code)}
		</div>
	);
}
