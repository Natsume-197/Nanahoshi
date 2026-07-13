import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Invalidate + refetch mounted AND unmounted consumers. The default
 * refetchType ("active") only marks unmounted queries stale, so the page the
 * user navigates to next paints the persisted cache first and the fresh data
 * pops in a beat later. Refetching everything at mutation time means the
 * destination page mounts already fresh.
 *
 * Unmounted entries are only refetched when they carry a queryFn — cache
 * entries seeded via setQueryData (progress mirrors) or restored from
 * localStorage don't, and refetching those throws "Missing queryFn". They
 * stay invalidated and refetch on next mount instead.
 */
export function invalidateEverywhere(
	queryClient: QueryClient,
	queryKeys: QueryKey[],
) {
	return Promise.all(
		queryKeys.flatMap((queryKey) => [
			queryClient.invalidateQueries({ queryKey }),
			queryClient.refetchQueries({
				queryKey,
				type: "inactive",
				predicate: (query) => typeof query.options.queryFn === "function",
			}),
		]),
	);
}
