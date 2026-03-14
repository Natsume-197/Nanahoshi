import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";

type CollectionMembership = {
	id: string;
	name: string;
	description: string | null;
	isPublic: boolean;
	inCollection: boolean;
	updatedAt: string | null;
};

export function useBookContextMenuActions(bookUuid: string) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid },
	});
	const collectionsMembershipQueryOptions =
		orpc.collections.listBookMemberships.queryOptions({
			input: { bookUuid },
		});
	const progressQueryOptions = orpc.readingProgress.getProgress.queryOptions({
		input: { bookUuid },
	});
	const shelfQueryOptions = orpc.bookShelf.get.queryOptions({
		input: { bookUuid },
	});

	const likeStatusQuery = useQuery({
		...likeStatusQueryOptions,
		enabled: false,
		staleTime: 60_000,
	});
	const collectionsMembershipQuery = useQuery({
		...collectionsMembershipQueryOptions,
		enabled: false,
		staleTime: 60_000,
	});
	const progressQuery = useQuery({
		...progressQueryOptions,
		enabled: false,
		staleTime: 60_000,
	});
	const shelfQuery = useQuery({
		...shelfQueryOptions,
		enabled: false,
		staleTime: 60_000,
	});

	const toggleLikeMutation = useMutation({
		mutationFn: () => client.likedBooks.toggleLike({ bookUuid }),
		onSuccess: async (result) => {
			queryClient.setQueryData(likeStatusQueryOptions.queryKey, result);
			toast.success(
				result.liked ? "Added to Your Likes" : "Removed from Your Likes",
			);
			await queryClient.invalidateQueries({
				queryKey: [["likedBooks", "listLiked"]],
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update like status",
			);
		},
	});
	const createCollectionMutation = useMutation({
		mutationFn: (input: { name: string; isPublic: boolean }) =>
			client.collections.create({
				name: input.name,
				isPublic: input.isPublic,
				addBookUuid: bookUuid,
			}),
		onSuccess: async (created) => {
			queryClient.setQueryData<CollectionMembership[]>(
				collectionsMembershipQueryOptions.queryKey,
				(previous) => {
					const safePrevious = previous ?? [];
					const alreadyExists = safePrevious.some(
						(item) => item.id === created.id,
					);
					if (alreadyExists) return safePrevious;

					return [
						{
							id: created.id,
							name: created.name,
							description: created.description ?? null,
							isPublic: created.isPublic,
							inCollection: true,
							updatedAt: created.updatedAt,
						},
						...safePrevious,
					];
				},
			);
			await queryClient.invalidateQueries({
				queryKey: orpc.collections.list.queryOptions().queryKey,
			});
			toast.success("Collection created");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to create collection",
			);
		},
	});
	const setCollectionMembershipMutation = useMutation({
		mutationFn: (input: { collectionId: string; inCollection: boolean }) =>
			client.collections.setBookMembership({
				collectionId: input.collectionId,
				bookUuid,
				inCollection: input.inCollection,
			}),
		onSuccess: (result, variables) => {
			queryClient.setQueryData<CollectionMembership[]>(
				collectionsMembershipQueryOptions.queryKey,
				(previous) => {
					if (!previous) return previous;

					return previous.map((item) => {
						if (item.id !== variables.collectionId) {
							return item;
						}
						return {
							...item,
							inCollection: variables.inCollection,
						};
					});
				},
			);

			if (variables.inCollection) {
				toast.success(
					result.changed
						? "Book added to collection"
						: "Book is already in this collection",
				);
				return;
			}

			toast.success(
				result.changed
					? "Book removed from collection"
					: "Book was not in this collection",
			);
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update collection membership",
			);
		},
	});
	const removeFromContinueReadingMutation = useMutation({
		mutationFn: () =>
			client.readingProgress.saveProgress({
				bookUuid,
				status: "unread",
			}),
		onSuccess: async (result) => {
			queryClient.setQueryData(progressQueryOptions.queryKey, result);
			await router.invalidate();
			toast.success("Removed from Continue Reading");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to remove book from Continue Reading",
			);
		},
	});

	const invalidateShelfQueries = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: [["bookShelf", "getPublicShelf"]],
		});
	}, [queryClient]);

	const setShelfMutation = useMutation({
		mutationFn: (status: string) =>
			client.bookShelf.set({ bookUuid, status: status as never }),
		onSuccess: async (result) => {
			queryClient.setQueryData(shelfQueryOptions.queryKey, result);
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
			toast.success("Shelf updated");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to update shelf",
			);
		},
	});
	const removeShelfMutation = useMutation({
		mutationFn: () => client.bookShelf.remove({ bookUuid }),
		onSuccess: async () => {
			queryClient.setQueryData(shelfQueryOptions.queryKey, null);
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
			toast.success("Removed from shelf");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove from shelf",
			);
		},
	});

	const isLiked = likeStatusQuery.data?.liked ?? false;
	const isInContinueReading = progressQuery.data?.status === "reading";
	const isLikeActionBusy =
		toggleLikeMutation.isPending ||
		(likeStatusQuery.isFetching && !likeStatusQuery.data);
	const isCollectionActionBusy =
		createCollectionMutation.isPending ||
		setCollectionMembershipMutation.isPending;
	const isReadingProgressActionBusy =
		removeFromContinueReadingMutation.isPending;
	const prepareBookContext = useCallback(
		(targetBookUuid: string) => {
			if (!targetBookUuid) return;
			void queryClient.prefetchQuery({
				...orpc.likedBooks.getLikeStatus.queryOptions({
					input: { bookUuid: targetBookUuid },
				}),
				staleTime: 60_000,
			});
			void queryClient.prefetchQuery({
				...orpc.collections.listBookMemberships.queryOptions({
					input: { bookUuid: targetBookUuid },
				}),
				staleTime: 60_000,
			});
			void queryClient.prefetchQuery({
				...orpc.readingProgress.getProgress.queryOptions({
					input: { bookUuid: targetBookUuid },
				}),
				staleTime: 60_000,
			});
			void queryClient.prefetchQuery({
				...orpc.bookShelf.get.queryOptions({
					input: { bookUuid: targetBookUuid },
				}),
				staleTime: 60_000,
			});
		},
		[queryClient],
	);

	const handleOpenInNewTab = useCallback(() => {
		if (!bookUuid) return;
		window.open(
			`/dashboard/books/${bookUuid}`,
			"_blank",
			"noopener,noreferrer",
		);
	}, [bookUuid]);

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
	const handleRemoveFromContinueReading = useCallback(() => {
		if (!bookUuid || progressQuery.data?.status !== "reading") return;
		removeFromContinueReadingMutation.mutate();
	}, [bookUuid, progressQuery.data?.status, removeFromContinueReadingMutation]);
	const handleSetCollectionMembership = useCallback(
		(collectionId: string, inCollection: boolean) => {
			setCollectionMembershipMutation.mutate({ collectionId, inCollection });
		},
		[setCollectionMembershipMutation],
	);
	const handleCreateCollection = useCallback(
		async (name: string, isPublic: boolean) => {
			const normalizedName = name.trim();
			if (!normalizedName) return false;
			try {
				await createCollectionMutation.mutateAsync({
					name: normalizedName,
					isPublic,
				});
				return true;
			} catch {
				return false;
			}
		},
		[createCollectionMutation],
	);

	const handleSetShelf = useCallback(
		(status: string) => {
			setShelfMutation.mutate(status);
		},
		[setShelfMutation],
	);
	const handleRemoveShelf = useCallback(() => {
		removeShelfMutation.mutate();
	}, [removeShelfMutation]);

	return {
		collectionsMemberships: collectionsMembershipQuery.data ?? [],
		currentShelfStatus: (shelfQuery.data?.status as string | undefined) ?? null,
		handleOpenInNewTab,
		handleDownload,
		handleCreateCollection,
		handleRemoveFromContinueReading,
		handleRemoveShelf,
		handleSetCollectionMembership,
		handleSetShelf,
		handleToggleLike,
		isCollectionActionBusy,
		isCollectionsLoading:
			collectionsMembershipQuery.isFetching && !collectionsMembershipQuery.data,
		isInContinueReading,
		isLiked,
		isLikeActionBusy,
		isReadingProgressActionBusy,
		isReadingProgressLoading: progressQuery.isFetching && !progressQuery.data,
		isShelfActionBusy: setShelfMutation.isPending || removeShelfMutation.isPending,
		isShelfLoading: shelfQuery.isFetching && !shelfQuery.data,
		likeActionLabel: isLiked ? "Unlike" : "Like",
		prepareBookContext,
	};
}
