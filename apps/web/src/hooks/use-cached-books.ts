import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listCachedBooks } from "@/lib/reader/db";

export const CACHED_BOOKS_QUERY_KEY = ["reader-cached-books"];

export function useCachedBooks() {
	return useQuery({
		queryKey: CACHED_BOOKS_QUERY_KEY,
		queryFn: listCachedBooks,
		// IndexedDB reads are cheap; always re-read on mount so the list
		// reflects books cached by the reader or another tab.
		staleTime: 0,
	});
}

export function useCachedBookUuids(): Set<string> {
	const { data } = useCachedBooks();
	return useMemo(() => new Set((data ?? []).map((b) => b.uuid)), [data]);
}
