/**
 * Add the server-derived client IP to incoming requests. Headers are edited in
 * place: in Bun, `new Request(request, …)` buffers the whole body in memory
 * (a 300 MB upload cost ~600 MB of RAM), and server.upgrade() rejects a cloned
 * Request for WebSockets.
 */
export function prepareClientIpRequest(
	request: Request,
	peerAddress: string | undefined,
	trustedProxyIps: ReadonlySet<string>,
): Request {
	const { headers } = request;
	const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	headers.delete("x-nanahoshi-client-ip");
	if (peerAddress) {
		headers.set(
			"x-nanahoshi-client-ip",
			trustedProxyIps.has(peerAddress) && forwarded ? forwarded : peerAddress,
		);
	}
	return request;
}
