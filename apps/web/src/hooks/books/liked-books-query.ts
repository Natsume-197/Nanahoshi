import { orpc } from "@/utils/orpc";

const LIKED_BOOKS_LIMIT = 50;

/**
 * Shared options for the liked-books list so every consumer (likes page
 * loader/component, ambient bloom) hits the same query cache entry.
 */
export function likedBooksQueryOptions() {
	return orpc.likedBooks.listLiked.queryOptions({
		input: { limit: LIKED_BOOKS_LIMIT },
	});
}
