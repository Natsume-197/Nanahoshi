/**
 * Add the server-derived client IP to ordinary HTTP requests. WebSocket
 * upgrades must retain Bun's original Request object: server.upgrade() rejects
 * a cloned Request even when all of its headers are identical.
 */
export function prepareClientIpRequest(
	request: Request,
	peerAddress: string | undefined,
	trustedProxyIps: ReadonlySet<string>,
): Request {
	if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
		return request;
	}

	const headers = new Headers(request.headers);
	headers.delete("x-nanahoshi-client-ip");
	if (peerAddress) {
		const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
		headers.set(
			"x-nanahoshi-client-ip",
			trustedProxyIps.has(peerAddress) && forwarded ? forwarded : peerAddress,
		);
	}
	return new Request(request, { headers });
}
