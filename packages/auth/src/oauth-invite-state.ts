const INVITE_CODE_PATTERN = /^[\w-]{1,64}$/;

/** Read the invite code Better Auth carried inside its signed OAuth state. */
export function inviteCodeFromOAuthState(
	state: Record<string, unknown> | null | undefined,
): string | null {
	const code = state?.inviteCode;
	return typeof code === "string" && INVITE_CODE_PATTERN.test(code)
		? code
		: null;
}
