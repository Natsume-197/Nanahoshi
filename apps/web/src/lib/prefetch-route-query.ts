import type { FetchQueryOptions, QueryClient } from "@tanstack/react-query";

/** A route owns its small preload until completion, even if a transient UI
 * observer unmounts. Regular useQuery requests still use normal cancellation. */
export function prefetchRouteQuery<T>(
	client: QueryClient,
	options: FetchQueryOptions<T>,
) {
	const queryFn = options.queryFn;
	if (typeof queryFn !== "function") return client.prefetchQuery(options);
	return client.prefetchQuery({
		...options,
		// Do not read the cache-owned signal: removing the last UI observer
		// would abort the route's preload and the next mount would repeat it.
		queryFn: ({ client, queryKey, meta }) =>
			queryFn({
				client,
				queryKey,
				meta,
				signal: new AbortController().signal,
			}),
	});
}
