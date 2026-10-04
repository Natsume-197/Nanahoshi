type Fetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

function requestUrl(input: RequestInfo | URL) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

/** Fails network requests the way React Native does with no connection, so
 * the app takes its real offline paths. Local URIs (file:, asset:) pass. */
export function guardFetch(fetchImpl: Fetch, isOffline: () => boolean): Fetch {
	return (input, init) =>
		isOffline() && /^(https?|wss?):/i.test(requestUrl(input))
			? Promise.reject(new TypeError("Network request failed"))
			: fetchImpl(input, init);
}
