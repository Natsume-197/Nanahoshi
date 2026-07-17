import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/hooks/use-session";
import { CACHED_BOOKS_QUERY_KEY } from "@/lib/offline";

export { CACHED_BOOKS_QUERY_KEY };

export function useCachedBooks() {
	// Scope the offline list to the active server so downloads don't bleed across
	// servers. The serverId in the key also refetches the list on switch.
	const { data: session } = useSession();
	const serverId = session?.session.activeOrganizationId ?? null;
	return useQuery({
		queryKey: [...CACHED_BOOKS_QUERY_KEY, serverId],
		// Dynamic import keeps Dexie out of every chunk that renders this hook
		// (detail pages, downloads) — it loads on first actual read.
		queryFn: async () => {
			const { listCachedBooks } = await import("@/lib/reader/db");
			return listCachedBooks(serverId);
		},
		// IndexedDB reads are cheap; always re-read on mount so the list
		// reflects books cached by the reader or another tab.
		staleTime: 0,
	});
}

export function useCachedBookUuids(): Set<string> {
	const { data } = useCachedBooks();
	return useMemo(() => new Set((data ?? []).map((b) => b.uuid)), [data]);
}
