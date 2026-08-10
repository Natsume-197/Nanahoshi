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
import { CACHED_BOOKS_QUERY_KEY, QUERY_PERSIST_KEY } from "@/lib/offline";
import { notifySessionUnauthorized } from "@/lib/session-events";

export const queryClient = new QueryClient({
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

/**
 * Restores the persisted query cache and starts persisting changes. Must run
 * strictly AFTER hydration finishes: the SSR HTML always renders queries in
 * their loading state (the server has no localStorage), so restoring earlier
 * makes React hydrate streamed route boundaries against a cache that already
 * has data — a full-tree hydration mismatch on every page. The root mount
 * effect is still too early (it fires when the shell hydrates, before the
 * streamed route content does), hence the idle-callback hop: React schedules
 * the remaining boundary hydration as tasks, and idle fires once that queue
 * drains.
 */
export function setupQueryPersistence() {
	if (typeof window === "undefined") return;
	const schedule =
		"requestIdleCallback" in window
			? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 2000 })
			: (cb: () => void) => window.setTimeout(cb, 200);
	schedule(startQueryPersistence);
}

function startQueryPersistence() {
	persistQueryClient({
		queryClient,
		persister: createSyncStoragePersister({
			storage: window.localStorage,
			key: QUERY_PERSIST_KEY,
		}),
		maxAge: 7 * 24 * 60 * 60 * 1000,
		// v3: discard pairings persisted before Read & Listen alignment status existed.
		buster: "v3",
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
				// Loader pass-through entries (fetchLoaderQuery) only exist to dedupe
				// preload + navigation; persisting them would pile up detail blobs.
				if (first === "loader") return false;
				// Shuffled discovery rows (random picks and series) must
				// reshuffle on a full page reload, so keep them out of the persisted
				// cache — the in-memory cache still pins them during the session.
				const leaf = Array.isArray(first) ? first[first.length - 1] : undefined;
				// Logs may contain diagnostic context and should always be fetched fresh;
				// never retain them in the browser's persistent localStorage cache.
				if (leaf === "listLogs") return false;
				// Alignment sessions contain thousands of cues and are cheap to fetch
				// from managed storage; keeping them in localStorage bloats every restore.
				if (leaf === "getSession") return false;
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

const getORPCClient = () => {
	return createORPCClient(link) as RouterClient<AppRouter, ORPCClientContext>;
};

export const client: RouterClient<AppRouter, ORPCClientContext> =
	getORPCClient();

export const orpc = createTanstackQueryUtils(client);
