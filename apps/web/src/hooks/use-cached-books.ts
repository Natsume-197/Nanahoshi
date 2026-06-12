import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listCachedBooks } from "@/lib/reader/db";

export const CACHED_BOOKS_QUERY_KEY = ["reader-cached-books"];

export function useCachedBooks() {
	return useQuery({
		queryKey: CACHED_BOOKS_QUERY_KEY,
		queryFn: listCachedBooks,
		staleTime: 60_000,
	});
}

export function useCachedBookUuids(): Set<string> {
	const { data } = useCachedBooks();
	return useMemo(() => new Set((data ?? []).map((b) => b.uuid)), [data]);
}
