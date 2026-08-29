import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { getUser } from "@/functions/get-user";

export type AppSession = Awaited<ReturnType<typeof getUser>>;

/** The canonical session query key. The root route seeds it in `beforeLoad`. */
export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * Reuses the session already resolved by the root route, avoiding Better Auth's
 * second client-side session request and keeping SSR hydration deterministic.
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
		// Matches the root beforeLoad's staleTime — invalidation, not staleness,
		// drives session refreshes (sign-out / server switch).
		staleTime: 5 * 60_000,
		enabled: isClient,
		initialData: isClient ? contextSession : undefined,
	});

	const data = (isClient ? query.data : contextSession) ?? null;
	return { data, isPending: false };
}
