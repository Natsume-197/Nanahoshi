import type { AppRouter } from "@nanahoshi/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
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
export function createApi(
	baseURL: string,
	auth: NanahoshiAuth,
	onUnauthorized: () => void,
) {
	const callListeners = new Set<(call: ApiCall) => void>();
	const link = new RPCLink({
		url: `${baseURL}/rpc`,
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
			const response = await fetch(request, { ...init, credentials: "omit" });
			if (response.status === 401) onUnauthorized();
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
