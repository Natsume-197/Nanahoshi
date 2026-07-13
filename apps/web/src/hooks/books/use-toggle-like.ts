import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateEverywhere } from "@/lib/invalidate-everywhere";
import {
	adjustLikedCount,
	removeBookFromLikedLists,
} from "@/lib/liked-books-cache";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

export type MediaType = "ebook" | "audiobook";

/**
 * Single toggle-like mutation shared by the context menu and both detail
 * pages: optimistic heart state, surgical likes-list/count cache updates,
 * then a cross-page refetch so /dashboard/likes mounts already fresh.
 */
export function useToggleLike(bookUuid: string, mediaType: MediaType) {
	const queryClient = useQueryClient();
	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid },
	});
	const format = mediaType === "audiobook" ? "audiobooks" : "books";

	return useMutation({
		mutationFn: () => client.likedBooks.toggleLike({ bookUuid }),
		onMutate: async () => {
			await queryClient.cancelQueries({
				queryKey: likeStatusQueryOptions.queryKey,
			});
			const previous = queryClient.getQueryData(
				likeStatusQueryOptions.queryKey,
			);
			queryClient.setQueryData(
				likeStatusQueryOptions.queryKey,
				(old: typeof previous) => (old ? { ...old, liked: !old.liked } : old),
			);
			return { previous };
		},
		onSuccess: async (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
			if (result.liked) {
				adjustLikedCount(queryClient, format, 1);
			} else {
				removeBookFromLikedLists(queryClient, bookUuid);
				adjustLikedCount(queryClient, format, -1);
			}
			toast.success(
				result.liked
					? m["toast.added_to_likes"]()
					: m["toast.removed_from_likes"](),
			);
			await invalidateEverywhere(queryClient, [
				[["likedBooks", "listLiked"]],
				[["likedBooks", "count"]],
			]);
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					likeStatusQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, m["toast.like_failed"]()));
		},
	});
}
