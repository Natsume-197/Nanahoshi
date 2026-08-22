/** The preview is a status union; the per-user fields only exist on "ok". */
type AutoJoinPreview = {
	status: string;
	alreadyMember?: boolean;
	requiresDiscord?: boolean;
	discordLinked?: boolean;
};

/**
 * Whether returning from the Discord round-trip should join the server without
 * a second click. The OAuth callback lands back on `/invite/CODE?join=1`, and
 * a visitor who just signed up (or linked Discord) *for this invite* has
 * already consented — asking them to press "Accept" again is where people used
 * to drop out with an account but no membership.
 */
export function shouldAutoJoin(opts: {
	requested: boolean;
	hasSession: boolean;
	preview: AutoJoinPreview | null | undefined;
}): boolean {
	if (!opts.requested || !opts.hasSession) return false;
	const preview = opts.preview;
	if (preview?.status !== "ok") return false;
	if (preview.alreadyMember) return false;
	// Joining would fail the server-side Discord gate; the page asks the visitor
	// to link Discord first instead of firing a mutation that can only 403.
	if (preview.requiresDiscord && !preview.discordLinked) return false;
	return true;
}
