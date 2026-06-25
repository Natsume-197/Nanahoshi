import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { authClient } from "@/lib/auth-client";
import { listCachedBooks } from "@/lib/reader/db";

export const CACHED_BOOKS_QUERY_KEY = ["reader-cached-books"];

export function useCachedBooks() {
	// Scope the offline list to the active server so downloads don't bleed across
	// servers. The serverId in the key also refetches the list on switch.
	const { data: activeOrg } = authClient.useActiveOrganization();
	const serverId = activeOrg?.id ?? null;
	return useQuery({
		queryKey: [...CACHED_BOOKS_QUERY_KEY, serverId],
		queryFn: () => listCachedBooks(serverId),
		// IndexedDB reads are cheap; always re-read on mount so the list
		// reflects books cached by the reader or another tab.
		staleTime: 0,
	});
}

export function useCachedBookUuids(): Set<string> {
	const { data } = useCachedBooks();
	return useMemo(() => new Set((data ?? []).map((b) => b.uuid)), [data]);
}
