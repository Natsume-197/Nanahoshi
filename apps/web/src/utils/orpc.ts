import type { AppRouter } from "@nanahoshi-v2/api/routers/index";
import { env } from "@nanahoshi-v2/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notifySessionUnauthorized } from "@/lib/session-events";

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// Mutations invalidate explicitly (invalidateEverywhere) and server-side
				// changes arrive as gateway events, so freshness never depends on this —
				// it only controls refetch-on-remount churn while navigating.
				staleTime: 5 * 60_000,
				gcTime: 24 * 60 * 60 * 1000,
				refetchOnWindowFocus: false,
				retry: 1,
			},
		},
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (typeof window === "undefined" || !navigator.onLine) return;
				toast.error(`Error: ${error.message}`, {
					action: {
						label: "retry",
						onClick: query.invalidate,
					},
				});
			},
		}),
	});
}

/** Browser-only compatibility client for imperative UI helpers. Routers use a
 * fresh client on the server so request caches can never cross users. */
export const queryClient = createQueryClient();

interface ORPCClientContext {
	/**
	 * Let the request outlive page hide/freeze (reading progress syncs fired
	 * from visibilitychange/pagehide would otherwise be dropped on mobile).
	 */
	keepalive?: boolean;
}

const link = new RPCLink<ORPCClientContext>({
	url: `${env.VITE_SERVER_URL}/rpc`,
	async fetch(url, options, { context }) {
		const response = await fetch(url, {
			...options,
			credentials: "include",
			keepalive: context?.keepalive,
		});
		if (response.status === 401) notifySessionUnauthorized();
		return response;
	},
});

export const client: RouterClient<AppRouter, ORPCClientContext> =
	createORPCClient(link) as RouterClient<AppRouter, ORPCClientContext>;

export const orpc = createTanstackQueryUtils(client);
