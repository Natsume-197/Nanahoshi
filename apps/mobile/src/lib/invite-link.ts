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

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
