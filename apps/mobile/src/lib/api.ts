import type { AppRouter } from "@nanahoshi/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import type { NanahoshiAuth } from "./auth-client";
import { shouldRetry } from "./query-retry";

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 5 * 60_000,
				gcTime: 24 * 60 * 60_000,
				retry: shouldRetry,
			},
		},
	});
}

/** A call that succeeded: which procedure, with what input. */
export type ApiCall = { path: readonly string[]; input: unknown };

/**
 * Same oRPC surface the web app uses. React Native has no cookie jar, so the
 * session cookie better-auth keeps in SecureStore is attached by hand.
 */
/** Told whether each request reached the server. */
export type ServerWatch = { answered: () => void; failed: () => void };

const isBatch = (url: string) => url.includes("/__batch__");

/** Uploads stay single requests: a batch would buffer the whole file. */
function carriesFile(body: unknown): boolean {
	if (body instanceof Blob || body instanceof FormData) return true;
	if (!body || typeof body !== "object") return false;
	return Object.values(body).some(
		(value) => value instanceof Blob || value instanceof FormData,
	);
}

export function createApi(
	baseURL: string,
	auth: NanahoshiAuth,
	onUnauthorized: () => void,
	watch?: ServerWatch,
) {
	const callListeners = new Set<(call: ApiCall) => void>();
	// A server from before batching answers the batch URL with 404: from
	// then on every call goes on its own.
	let batching = true;
	const link = new RPCLink({
		url: `${baseURL}/rpc`,
		plugins: [
			// React Native allows 5 requests per host at once: Home's ~18
			// queries went out in waves. Buffered, as RN can't read a stream.
			new BatchLinkPlugin({
				groups: [{ condition: () => true, context: {} }],
				mode: "buffered",
				exclude: ({ request }) => !batching || carriesFile(request.body),
			}),
		],
		// Every caller (screens, the player, the reader's bridge) goes through
		// here, so what it saved can be watched in one place.
		interceptors: [
			async ({ path, input, next }) => {
				const output = await next();
				for (const listener of callListeners) listener({ path, input });
				return output;
			},
		],
		headers: async () => {
			const cookie = await auth.getCookie();
			return cookie ? { Cookie: cookie } : {};
		},
		async fetch(request, init) {
			let response: Response;
			try {
				response = await fetch(request, { ...init, credentials: "omit" });
			} catch (error) {
				// A request we cancelled says nothing about the server.
				if (!request.signal.aborted) watch?.failed();
				throw error;
			}
			watch?.answered();
			if (response.status === 401) onUnauthorized();
			if (response.status === 404 && isBatch(request.url)) batching = false;
			return response;
		},
	});
	const client: RouterClient<AppRouter> = createORPCClient(link);
	return {
		client,
		orpc: createTanstackQueryUtils(client),
		/** Hears every successful call; returns the unsubscribe. */
		onCall(listener: (call: ApiCall) => void) {
			callListeners.add(listener);
			return () => {
				callListeners.delete(listener);
			};
		},
	};
}

export type Api = ReturnType<typeof createApi>;
export type ApiClient = Api["client"];
