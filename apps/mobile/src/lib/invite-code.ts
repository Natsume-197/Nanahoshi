/** The code out of whatever was pasted: an invite link (from any host), a
 * bare /invite/ path, or the code itself. Null when nothing is left. */
export function parseInviteCode(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const path = /\/invite\/([^/?#\s]+)/.exec(trimmed);
	if (path) return decodeURIComponent(path[1]);
	return /^[\w-]+$/.test(trimmed) ? trimmed : null;
}
