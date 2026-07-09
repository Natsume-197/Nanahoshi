import type { AppRouter } from "@nanahoshi-v2/api/routers/index";
import { env } from "@nanahoshi-v2/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
	defaultShouldDehydrateQuery,
	QueryCache,
	QueryClient,
} from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { toast } from "sonner";
import { CACHED_BOOKS_QUERY_KEY } from "@/hooks/use-cached-books";
import { QUERY_PERSIST_KEY } from "@/lib/offline";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			gcTime: 24 * 60 * 60 * 1000,
			refetchOnWindowFocus: false,
			retry: 1,
		},
	},
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (typeof navigator !== "undefined" && !navigator.onLine) return;
			toast.error(`Error: ${error.message}`, {
				action: {
					label: "retry",
					onClick: query.invalidate,
				},
			});
		},
	}),
});

if (typeof window !== "undefined") {
	persistQueryClient({
		queryClient,
		persister: createSyncStoragePersister({
			storage: window.localStorage,
			key: QUERY_PERSIST_KEY,
		}),
		maxAge: 7 * 24 * 60 * 60 * 1000,
		// v2: discard caches persisted before library-delete invalidation existed
		buster: "v2",
		dehydrateOptions: {
			shouldDehydrateQuery: (query) => {
				if (!defaultShouldDehydrateQuery(query)) return false;
				// orpc keys are [[...path], { type, input }].
				const [first, meta] = query.queryKey as [
					unknown,
					{ input?: { sort?: unknown } } | undefined,
				];
				// The downloads list reads IndexedDB (already local); persisting a
				// snapshot would shadow it with stale data on restore.
				if (first === CACHED_BOOKS_QUERY_KEY[0]) return false;
				// Shuffled discovery rows ("You might like", random series) must
				// reshuffle on a full page reload, so keep them out of the persisted
				// cache — the in-memory cache still pins them during the session.
				const leaf = Array.isArray(first) ? first[first.length - 1] : undefined;
				if (leaf === "listRandom" || meta?.input?.sort === "random") {
					return false;
				}
				return true;
			},
		},
	});
}

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
