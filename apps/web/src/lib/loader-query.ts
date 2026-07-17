import type { QueryClient } from "@tanstack/react-query";

/**
 * Routes a loader's server-fn call through the query cache so a hover preload
 * and the click that follows share ONE request — the router's own loader data
 * has `staleTime: 0`, so without this every navigation re-fetches what the
 * intent preload just loaded. `router.invalidate()` re-runs the active route's
 * loader with cause "stay", which bypasses the cache so edits render fresh.
 *
 * SSR always calls through: the server-side query client is process-wide, so
 * caching per-user loader results there would leak across requests. Keys are
 * prefixed "loader" and excluded from localStorage persistence (see orpc.ts).
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
		// An explicit `staleTime: undefined` would override the client default
		// with 0, so only set it on the bypass path.
		...(cause === "stay" ? { staleTime: 0 } : {}),
		// Match direct-call behavior: a 404 must reject immediately, not retry.
		retry: false,
	});
}
