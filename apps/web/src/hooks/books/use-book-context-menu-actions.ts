import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { invalidateEverywhere } from "@/lib/invalidate-everywhere";
import { m } from "@/paraglide/messages";
import { getErrorMessage } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";
import { type MediaType, useToggleLike } from "./use-toggle-like";

export type { MediaType } from "./use-toggle-like";

const MENU_STALE_TIME = 60_000;

type CollectionMembership = {
	id: string;
	name: string;
	description: string | null;
	isPublic: boolean;
	inCollection: boolean;
	updatedAt: string | null;
};

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

	const toggleLikeMutation = useToggleLike(bookUuid, mediaType);
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
			await invalidateEverywhere(queryClient, [
				orpc.collections.list.key(),
				["collections", "search"],
			]);
			toast.success(m["toast.collection_created"]());
		},
		onError: (error) => {
			toast.error(
				getErrorMessage(error, m["toast.collection_create_failed"]()),
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
		onSuccess: (_result, variables) => {
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
			// The collection page and the grids show contents/updatedAt — refresh
			// them now so navigating there doesn't flash stale data.
			void invalidateEverywhere(queryClient, [
				orpc.collections.getDetails.key({
					input: { collectionId: variables.collectionId },
				}),
				orpc.collections.list.key(),
				["collections", "search"],
			]);

			if (variables.inCollection) {
				toast.success(m["toast.added_to_collection"]());
				return;
			}

			toast.success(m["toast.removed_from_collection"]());
		},
		onError: (error) => {
			toast.error(
				getErrorMessage(error, m["toast.collection_update_failed"]()),
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
				invalidateEverywhere(queryClient, [
					isAudiobook
						? orpc.listeningProgress.listInProgress.key()
						: orpc.readingProgress.listInProgress.key(),
				]),
				router.invalidate(),
			]);
			toast.success(
				isAudiobook
					? m["book.remove_continue_listening"]()
					: m["book.remove_continue_reading"](),
			);
		},
		onError: (error) => {
			toast.error(
				getErrorMessage(
					error,
					isAudiobook
						? m["toast.continue_listening_remove_failed"]()
						: m["toast.continue_reading_remove_failed"](),
				),
			);
		},
	});

	const invalidateShelfQueries = useCallback(async () => {
		const keys = isAudiobook
			? [
					[["audiobookShelf", "getPublicShelf"]],
					[["audiobookShelf", "getPublicShelfPaginated"]],
					[["audiobookShelf", "list"]],
				]
			: [
					[["bookShelf", "getPublicShelf"]],
					[["bookShelf", "getPublicShelfPaginated"]],
					[["bookShelf", "list"]],
				];
		// shelf "completed" drives the continue-series rail
		keys.push([["recommendations", "continueSeries"]]);
		await invalidateEverywhere(queryClient, keys);
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
			toast.success(m["toast.shelf_updated"]());
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["toast.shelf_update_failed"]()));
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
			toast.success(m["book.remove_from_shelf"]());
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["toast.shelf_remove_failed"]()));
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
			toast.error(getErrorMessage(error, m["toast.download_failed"]()));
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
		likeActionLabel: isLiked ? m["book.unlike"]() : m["book.like"](),
		prepareBookContext,
	};
}
