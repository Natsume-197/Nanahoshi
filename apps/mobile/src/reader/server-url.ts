/**
 * Points a URL the server built at the address this phone reaches it by. The
 * server signs its links with its own SERVER_URL, which a phone on the LAN
 * may not resolve (e.g. "nanahoshi-dev.localhost"); the signature covers only
 * the path and query, so swapping the origin keeps it valid.
 */
export function onConnectedServer(url: string, serverUrl: string): string {
	const signed = new URL(url);
	const connected = new URL(serverUrl);
	const base = connected.pathname.replace(/\/$/, "");
	return `${connected.origin}${base}${signed.pathname}${signed.search}`;
}
