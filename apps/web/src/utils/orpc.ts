import type { AppRouter } from "@nanahoshi-v2/api/routers/index";
import { env } from "@nanahoshi-v2/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: 5 * 60_000,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
	queryCache: new QueryCache({
		onError: (error, query) => {
			toast.error(`Error: ${error.message}`, {
				action: {
					label: "retry",
					onClick: query.invalidate,
				},
			});
		},
	}),
});

export interface ORPCClientContext {
	/**
	 * Let the request outlive page hide/freeze (reading progress syncs fired
	 * from visibilitychange/pagehide would otherwise be dropped on mobile).
	 */
	keepalive?: boolean;
}

const link = new RPCLink<ORPCClientContext>({
	url: `${env.VITE_SERVER_URL}/rpc`,
	fetch(url, options, { context }) {
		return fetch(url, {
			...options,
			credentials: "include",
			keepalive: context?.keepalive,
		});
	},
});

const getORPCClient = () => {
	return createORPCClient(link) as RouterClient<AppRouter, ORPCClientContext>;
};

export const client: RouterClient<AppRouter, ORPCClientContext> =
	getORPCClient();

export const orpc = createTanstackQueryUtils(client);
