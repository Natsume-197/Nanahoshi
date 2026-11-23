import { normalizeServerUrl } from "./server-url";

/** What `nanahoshi://invite?server=…&code=…&link=…` carries: the API the
 * invite belongs to, its code, and the web page to fall back to. */
export type InviteLink = { server: string; code: string; link: string };

const CODE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseInviteLink(params: {
	server?: string | string[];
	code?: string | string[];
	link?: string | string[];
}): InviteLink | null {
	const server = normalizeServerUrl(first(params.server) ?? "");
	const code = first(params.code)?.trim() ?? "";
	if (!server || !CODE.test(code)) return null;
	const link = first(params.link);
	return {
		server,
		code,
		link:
			link && /^https?:\/\//i.test(link) ? link : `${server}/invite/${code}`,
	};
}

/** The in-app route that shows the invite; `join` accepts it on arrival. */
export function inviteHref(invite: InviteLink, options?: { join?: boolean }) {
	return {
		pathname: "/invite" as const,
		params: {
			server: invite.server,
			code: invite.code,
			link: invite.link,
			...(options?.join ? { join: "1" } : {}),
		},
	};
}

/** The invite code in whatever someone pastes: the web link
 * (…/invite/abc123), the app link (nanahoshi://invite?code=…) or the code. */
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

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
