import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { getUser } from "@/functions/get-user";

export type AppSession = Awaited<ReturnType<typeof getUser>>;

/** The canonical session query key. The root route seeds it in `beforeLoad`. */
export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * Single client-side source of truth for the current session, replacing
 * better-auth's `authClient.useSession()`.
 *
 * Why not `authClient.useSession()`: it fires a *second*, independent browser
 * fetch of `/api/auth/get-session` (on top of the root's `getUser` query) with
 * its own focus/broadcast refetch machinery, all sharing better-auth's per-IP
 * rate-limit budget and tripping spurious 429s. This reads the `["auth",
 * "session"]` query the root already populates — the same cache invalidated on
 * sign-out / server switch — so there is no extra get-session traffic, and the
 * refetch (via the `getUser` server fn) runs server-side, off the browser's
 * rate-limit budget.
 *
 * Shape mirrors `authClient.useSession()` (`{ data, isPending }`, `data` is
 * `{ user, session } | null`) so it is a drop-in replacement.
 *
 * Hydration: the session is always resolved synchronously from the per-request
 * router context (SSR + dehydrated on the client), so there is no real loading
 * state. On the initial page load the root's `beforeLoad` does NOT re-run on the
 * client and the query cache is not dehydrated, so the query would start empty
 * and `isPending` on the first client render — which, branched against the
 * server's `isPending: false`, flips gated UI (e.g. a skeleton) and breaks
 * hydration. We therefore seed the query with the context session as
 * `initialData` (client only) and always report `isPending: false`, so the
 * first client render matches the server exactly. The query still refetches via
 * the `getUser` server fn on invalidation (sign-out / server switch), off the
 * browser's rate-limit budget.
 *
 * SSR: the shared query client is a module singleton, so we never seed it during
 * SSR (that would leak one request's session into another) — `initialData` is
 * withheld and the query stays disabled; we read the router context directly.
 */
export function useSession(): { data: AppSession; isPending: boolean } {
	const context = useRouteContext({ strict: false }) as {
		session?: AppSession;
	};
	const contextSession = context.session ?? null;
	const isClient = typeof window !== "undefined";
	const query = useQuery({
		queryKey: SESSION_QUERY_KEY,
		queryFn: () => getUser(),
		staleTime: 30_000,
		enabled: isClient,
		initialData: isClient ? contextSession : undefined,
	});

	const data = (isClient ? query.data : contextSession) ?? null;
	return { data, isPending: false };
}
