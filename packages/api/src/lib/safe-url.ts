/**
 * SSRF guard for server-side fetches of remote images (cover art). Only allows
 * http(s) URLs whose host is not an internal/reserved address. Cover URLs come
 * from third-party APIs today, but this blocks a malicious/redirected response
 * from pointing the server at internal targets (cloud metadata, RFC1918,
 * loopback, link-local).
 */
export function isSafePublicUrl(rawUrl: string): boolean {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return false;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return false;
	const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (
		host === "localhost" ||
		host === "0.0.0.0" ||
		host === "::1" ||
		host.endsWith(".localhost")
	) {
		return false;
	}
	// IPv4 private / loopback / link-local (incl. cloud metadata 169.254.169.254).
	if (/^(10|127)\./.test(host)) return false;
	if (/^169\.254\./.test(host)) return false;
	if (/^192\.168\./.test(host)) return false;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
	// IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
	if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) {
		return false;
	}
	return true;
}

export const MAX_REMOTE_IMAGE_BYTES = 15 * 1024 * 1024;
