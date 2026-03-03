import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";

export function useBookContextMenuActions(bookUuid: string) {
	const queryClient = useQueryClient();
	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid },
	});

	const likeStatusQuery = useQuery({
		...likeStatusQueryOptions,
		enabled: false,
		staleTime: 60_000,
	});

	const toggleLikeMutation = useMutation({
		mutationFn: () => client.likedBooks.toggleLike({ bookUuid }),
		onSuccess: (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update like status",
			);
		},
	});

	const isLiked = likeStatusQuery.data?.liked ?? false;
	const isLikeActionBusy =
		toggleLikeMutation.isPending || likeStatusQuery.isFetching;

	const handleMenuOpenChange = useCallback(
		(open: boolean) => {
			if (!open) return;
			if (!likeStatusQuery.data || likeStatusQuery.isStale) {
				void likeStatusQuery.refetch();
			}
		},
		[likeStatusQuery.data, likeStatusQuery.isStale, likeStatusQuery.refetch],
	);

	const handleDownload = useCallback(async () => {
		try {
			const { url } = await client.files.getSignedDownloadUrl({
				uuid: bookUuid,
			});

			window.open(url, "_blank");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to download this book",
			);
		}
	}, [bookUuid]);

	const handleToggleLike = useCallback(() => {
		toggleLikeMutation.mutate();
	}, [toggleLikeMutation]);

	return {
		handleDownload,
		handleMenuOpenChange,
		handleToggleLike,
		isLiked,
		isLikeActionBusy,
		likeActionLabel: isLiked ? "Unlike" : "Like",
	};
}
