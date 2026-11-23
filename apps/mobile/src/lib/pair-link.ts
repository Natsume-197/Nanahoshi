import { normalizeServerUrl } from "./server-url";

/** What the web's "Mobile app" QR carries: `nanahoshi://pair?server=…&token=…`,
 * the API to connect to and a single-use code for a session of its own. */
export type PairLink = { server: string; token: string };

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const SCHEME = /^nanahoshi(-dev)?:$/;

export function parsePairParams(params: {
	server?: string | string[];
	token?: string | string[];
}): PairLink | null {
	const server = normalizeServerUrl(first(params.server) ?? "");
	const token = first(params.token)?.trim() ?? "";
	if (!server || !TOKEN.test(token)) return null;
	return { server, token };
}

/** A scanned code, which may be anything a camera sees. Both the store app's
 * scheme and the development app's are accepted. */
export function parsePairLink(text: string): PairLink | null {
	let url: URL;
	try {
		url = new URL(text.trim());
	} catch {
		return null;
	}
	const target = url.host || url.pathname.replace(/^\/+/, "");
	if (!SCHEME.test(url.protocol) || target !== "pair") return null;
	return parsePairParams({
		server: url.searchParams.get("server") ?? undefined,
		token: url.searchParams.get("token") ?? undefined,
	});
}

export type PairFailure = "unreachable" | "expired" | "refused" | "failed";

/** The server's answer to a redeem, as what to tell the person. */
export function pairFailure(error: {
	status?: number;
	message?: string;
}): PairFailure {
	if (error.message === "PAIRING_EXPIRED") return "expired";
	if (error.message === "PAIRING_REFUSED" || error.status === 403)
		return "refused";
	return "failed";
}

function first(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}
