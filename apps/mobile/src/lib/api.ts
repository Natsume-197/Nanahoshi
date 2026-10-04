import type { AppRouter } from "@nanahoshi/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient } from "@tanstack/react-query";
import type { NanahoshiAuth } from "./auth-client";

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 5 * 60_000,
				gcTime: 24 * 60 * 60_000,
				retry: 1,
			},
		},
	});
}

/**
 * Same oRPC surface the web app uses. React Native has no cookie jar, so the
 * session cookie better-auth keeps in SecureStore is attached by hand.
 */
export function createApi(
	baseURL: string,
	auth: NanahoshiAuth,
	onUnauthorized: () => void,
) {
	const link = new RPCLink({
		url: `${baseURL}/rpc`,
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
	return { client, orpc: createTanstackQueryUtils(client) };
}

export type Api = ReturnType<typeof createApi>;
export type ApiClient = Api["client"];
