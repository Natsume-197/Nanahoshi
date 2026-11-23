const CODE = /^[A-Za-z0-9_-]{1,64}$/;

/** The invite code in whatever someone pastes: the web link
 * (…/invite/abc123), the app link (nanahoshi://invite?code=abc123) or the
 * bare code. */
export function inviteCodeFrom(input: string): string | null {
	const text = input.trim();
	if (CODE.test(text)) return text;
	try {
		const url = new URL(text);
		const fromQuery = url.searchParams.get("code");
		if (fromQuery && CODE.test(fromQuery)) return fromQuery;
		const fromPath = /\/invite\/([^/?#]+)/.exec(url.pathname)?.[1];
		return fromPath && CODE.test(fromPath) ? fromPath : null;
	} catch {
		return null;
	}
}
