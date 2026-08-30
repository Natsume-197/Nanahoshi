import type { QueryClient } from "@tanstack/react-query";

/**
 * Routes a loader's server-fn call through the query cache so a hover preload
 * and the click that follows share ONE request — the router's own loader data
 * has `staleTime: 0`, so without this every navigation re-fetches what the
 * intent preload just loaded. `router.invalidate()` re-runs the active route's
 * loader with cause "stay", which bypasses the cache so edits render fresh.
 *
 * SSR always calls through because the browser-only preload/click deduplication
 * has no value there. Keys are prefixed "loader" to keep them distinct from
 * regular procedure queries.
 */
export function fetchLoaderQuery<T>(
	queryClient: QueryClient,
	queryKey: readonly unknown[],
	queryFn: () => Promise<T>,
	cause: "preload" | "enter" | "stay",
): Promise<T> {
	if (typeof window === "undefined") return queryFn();
	return queryClient.fetchQuery({
		queryKey,
		queryFn,
		// Pinned below the client default on purpose: these entries exist to
		// dedupe a hover preload with the click that follows (seconds apart).
		// Nothing invalidates "loader" keys, so riding the long client default
		// would let detail pages miss edits made elsewhere for minutes.
		staleTime: cause === "stay" ? 0 : 30_000,
		// Match direct-call behavior: a 404 must reject immediately, not retry.
		retry: false,
	});
}
