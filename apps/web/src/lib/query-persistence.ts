import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
	defaultShouldDehydrateQuery,
	type QueryClient,
} from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { QUERY_PERSIST_KEY } from "@/lib/query-cache-keys";

/** Restore only after streamed hydration has drained. This module is loaded by
 * the authenticated provider so public auth pages never download persistence. */
export function setupQueryPersistence(queryClient: QueryClient) {
	if (typeof window === "undefined") return;
	const schedule =
		"requestIdleCallback" in window
			? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 2000 })
			: (cb: () => void) => window.setTimeout(cb, 200);
	schedule(() => startQueryPersistence(queryClient));
}

function startQueryPersistence(queryClient: QueryClient) {
	persistQueryClient({
		queryClient,
		persister: createSyncStoragePersister({
			storage: window.localStorage,
			key: QUERY_PERSIST_KEY,
		}),
		maxAge: 7 * 24 * 60 * 60 * 1000,
		buster: "v3",
		dehydrateOptions: {
			shouldDehydrateQuery: (query) => {
				if (!defaultShouldDehydrateQuery(query)) return false;
				const [first, meta] = query.queryKey as [
					unknown,
					{ input?: { sort?: unknown } } | undefined,
				];
				if (first === "loader") return false;
				const leaf = Array.isArray(first) ? first[first.length - 1] : undefined;
				if (
					leaf === "forUser" ||
					leaf === "listLogs" ||
					leaf === "getSession"
				) {
					return false;
				}
				return leaf !== "listRandom" && meta?.input?.sort !== "random";
			},
		},
	});
}
