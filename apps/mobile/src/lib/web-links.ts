import type { MediaKind } from "./routes";

/** The web page for a title on this server: what a shared link opens, and
 * what the server unfurls into a preview when the server allows it. */
export function titleWebUrl(serverUrl: string, kind: MediaKind, uuid: string) {
	const section = kind === "audiobook" ? "audiobooks" : "books";
	return `${serverUrl.replace(/\/+$/, "")}/dashboard/${section}/${encodeURIComponent(uuid)}`;
}
