import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

const MENU_STALE_TIME = 60_000;

type CollectionMembership = {
	id: string;
	name: string;
	description: string | null;
	isPublic: boolean;
	inCollection: boolean;
	updatedAt: string | null;
};

export type MediaType = "ebook" | "audiobook";

export function useBookContextMenuActions(
	bookUuid: string,
	mediaType: MediaType = "ebook",
) {
	const queryClient = useQueryClient();
	const router = useRouter();
	const isAudiobook = mediaType === "audiobook";
	const likeStatusQueryOptions = orpc.likedBooks.getLikeStatus.queryOptions({
		input: { bookUuid },
	});
	const collectionsMembershipQueryOptions =
		orpc.collections.listBookMemberships.queryOptions({
			input: { bookUuid },
		});
	const listeningProgressQueryOptions =
		orpc.listeningProgress.getProgress.queryOptions({
			input: { bookUuid },
		});
	const readingProgressQueryOptions =
		orpc.readingProgress.getProgress.queryOptions({
			input: { bookUuid },
		});
	const audiobookShelfQueryOptions = orpc.audiobookShelf.get.queryOptions({
		input: { bookUuid },
	});
	const bookShelfQueryOptions = orpc.bookShelf.get.queryOptions({
		input: { bookUuid },
	});

	const likeStatusQuery = useQuery({
		...likeStatusQueryOptions,
		enabled: false,
		staleTime: MENU_STALE_TIME,
	});
	const collectionsMembershipQuery = useQuery({
		...collectionsMembershipQueryOptions,
		enabled: false,
		staleTime: MENU_STALE_TIME,
	});
	// Both variants stay mounted (enabled: false, cache-only reads) so hooks
	// run unconditionally; isAudiobook just picks which one to expose.
	const listeningProgressQuery = useQuery({
		...listeningProgressQueryOptions,
		enabled: false,
		staleTime: MENU_STALE_TIME,
	});
	const readingProgressQuery = useQuery({
		...readingProgressQueryOptions,
		enabled: false,
		staleTime: MENU_STALE_TIME,
	});
	const audiobookShelfQuery = useQuery({
		...audiobookShelfQueryOptions,
		enabled: false,
		staleTime: MENU_STALE_TIME,
	});
	const bookShelfQuery = useQuery({
		...bookShelfQueryOptions,
		enabled: false,
		staleTime: MENU_STALE_TIME,
	});
	const progressQuery = isAudiobook
		? listeningProgressQuery
		: readingProgressQuery;
	const shelfQuery = isAudiobook ? audiobookShelfQuery : bookShelfQuery;

	const toggleLikeMutation = useMutation({
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
			toast.success(
				result.liked ? "Added to Your Likes" : "Removed from Your Likes",
			);
			await queryClient.invalidateQueries({
				queryKey: [["likedBooks", "listLiked"]],
			});
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					likeStatusQueryOptions.queryKey,
					context.previous,
				);
			}
			toast.error(getErrorMessage(error, "Failed to update like status"));
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
			toast.error(getErrorMessage(error, "Failed to create collection"));
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
				getErrorMessage(error, "Failed to update collection membership"),
			);
		},
	});
	const removeFromContinueReadingMutation = useMutation({
		mutationFn: async () => {
			if (isAudiobook) {
				const result = await client.listeningProgress.saveProgress({
					bookUuid,
					status: "unstarted",
				});
				queryClient.setQueryData(
					listeningProgressQueryOptions.queryKey,
					result,
				);
			} else {
				const result = await client.readingProgress.saveProgress({
					bookUuid,
					status: "unread",
				});
				queryClient.setQueryData(readingProgressQueryOptions.queryKey, result);
			}
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: isAudiobook
						? orpc.listeningProgress.listInProgress.key()
						: orpc.readingProgress.listInProgress.key(),
				}),
				router.invalidate(),
			]);
			toast.success(
				isAudiobook
					? "Removed from Continue Listening"
					: "Removed from Continue Reading",
			);
		},
		onError: (error) => {
			toast.error(
				getErrorMessage(
					error,
					isAudiobook
						? "Failed to remove from Continue Listening"
						: "Failed to remove book from Continue Reading",
				),
			);
		},
	});

	const invalidateShelfQueries = useCallback(async () => {
		const keys = isAudiobook
			? [[["audiobookShelf", "getPublicShelf"]]]
			: [[["bookShelf", "getPublicShelf"]], [["bookShelf", "list"]]];
		await Promise.all(
			keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
		);
	}, [queryClient, isAudiobook]);

	const setShelfMutation = useMutation({
		mutationFn: async (status: string) => {
			if (isAudiobook) {
				const result = await client.audiobookShelf.set({
					bookUuid,
					status: status as never,
				});
				queryClient.setQueryData(audiobookShelfQueryOptions.queryKey, result);
			} else {
				const result = await client.bookShelf.set({
					bookUuid,
					status: status as never,
				});
				queryClient.setQueryData(bookShelfQueryOptions.queryKey, result);
			}
		},
		onSuccess: async () => {
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
			toast.success("Shelf updated");
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to update shelf"));
		},
	});
	const removeShelfMutation = useMutation({
		mutationFn: () =>
			isAudiobook
				? client.audiobookShelf.remove({ bookUuid })
				: client.bookShelf.remove({ bookUuid }),
		onSuccess: async () => {
			if (isAudiobook) {
				queryClient.setQueryData(audiobookShelfQueryOptions.queryKey, null);
			} else {
				queryClient.setQueryData(bookShelfQueryOptions.queryKey, null);
			}
			await Promise.all([router.invalidate(), invalidateShelfQueries()]);
			toast.success("Removed from shelf");
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Failed to remove from shelf"));
		},
	});

	const isLiked = likeStatusQuery.data?.liked ?? false;
	const progressStatus = (progressQuery.data as { status?: string } | null)
		?.status;
	const isInContinueReading = isAudiobook
		? progressStatus === "listening"
		: progressStatus === "reading";
	const isLikeActionBusy =
		toggleLikeMutation.isPending ||
		(likeStatusQuery.isFetching && !likeStatusQuery.data);
	const isCollectionActionBusy =
		createCollectionMutation.isPending ||
		setCollectionMembershipMutation.isPending;
	const isReadingProgressActionBusy =
		removeFromContinueReadingMutation.isPending;
	const prepareBookContext = useCallback(
		(targetBookUuid: string, targetMediaType: MediaType = mediaType) => {
			if (!targetBookUuid) return;
			const targetIsAudiobook = targetMediaType === "audiobook";
			const input = { bookUuid: targetBookUuid };
			void queryClient.prefetchQuery({
				...orpc.likedBooks.getLikeStatus.queryOptions({ input }),
				staleTime: MENU_STALE_TIME,
			});
			void queryClient.prefetchQuery({
				...orpc.collections.listBookMemberships.queryOptions({ input }),
				staleTime: MENU_STALE_TIME,
			});
			if (targetIsAudiobook) {
				void queryClient.prefetchQuery({
					...orpc.listeningProgress.getProgress.queryOptions({ input }),
					staleTime: MENU_STALE_TIME,
				});
				void queryClient.prefetchQuery({
					...orpc.audiobookShelf.get.queryOptions({ input }),
					staleTime: MENU_STALE_TIME,
				});
			} else {
				void queryClient.prefetchQuery({
					...orpc.readingProgress.getProgress.queryOptions({ input }),
					staleTime: MENU_STALE_TIME,
				});
				void queryClient.prefetchQuery({
					...orpc.bookShelf.get.queryOptions({ input }),
					staleTime: MENU_STALE_TIME,
				});
			}
		},
		[queryClient, mediaType],
	);

	const handleOpenInNewTab = useCallback(() => {
		if (!bookUuid) return;
		const path = isAudiobook
			? `/dashboard/audiobooks/${bookUuid}`
			: `/dashboard/books/${bookUuid}`;
		window.open(path, "_blank", "noopener,noreferrer");
	}, [bookUuid, isAudiobook]);

	const handleDownload = useCallback(async () => {
		try {
			const { url } = await client.files.getSignedDownloadUrl({
				uuid: bookUuid,
			});

			window.open(url, "_blank");
		} catch (error) {
			toast.error(getErrorMessage(error, "Failed to download this book"));
		}
	}, [bookUuid]);

	const handleToggleLike = useCallback(() => {
		toggleLikeMutation.mutate();
	}, [toggleLikeMutation]);
	const handleRemoveFromContinueReading = useCallback(() => {
		if (!bookUuid || !isInContinueReading) return;
		removeFromContinueReadingMutation.mutate();
	}, [bookUuid, isInContinueReading, removeFromContinueReadingMutation]);
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
		isAudiobook,
		isCollectionActionBusy,
		isCollectionsLoading:
			collectionsMembershipQuery.isFetching && !collectionsMembershipQuery.data,
		isInContinueReading,
		isLiked,
		isLikeActionBusy,
		isReadingProgressActionBusy,
		isReadingProgressLoading: progressQuery.isFetching && !progressQuery.data,
		isShelfActionBusy:
			setShelfMutation.isPending || removeShelfMutation.isPending,
		isShelfLoading: shelfQuery.isFetching && !shelfQuery.data,
		likeActionLabel: isLiked ? "Unlike" : "Like",
		prepareBookContext,
	};
}
