import type { DynamicCollectionDefinitionV1 } from "@nanahoshi-v2/api/routers/collections/collection-rules";
import {
	ArrowLeft,
	CircleNotch,
	PencilSimple,
	Trash,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { useDebounce } from "@/hooks/use-debounce";
import { invalidateEverywhere } from "@/lib/invalidate-everywhere";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";

// Collections can mix ebooks and audiobooks. Use the taller ebook estimate so
// virtual rows always have enough room regardless of the item's media type.
const COLLECTION_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

export const Route = createFileRoute("/dashboard/collections/$collectionId")({
	component: CollectionDetailPage,
});

function CollectionDetailPage() {
	const { collectionId } = Route.useParams();
	const navigate = useNavigate();
	const { can, isLoading: abilitiesLoading } = useAbilities();
	const canRead = can("collection", "read");
	const canDelete = can("collection", "delete");
	const canUpdate = can("collection", "update");
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [search, setSearch] = useState("");
	const query = useDebounce(search.trim(), 300);

	const deleteCollectionMutation = useMutation({
		mutationFn: () => client.collections.delete({ collectionId }),
		onSuccess: async () => {
			await invalidateEverywhere(queryClient, [
				orpc.collections.list.key(),
				["collections", "search"],
			]);
			queryClient.invalidateQueries({
				queryKey: [["collections", "listBookMemberships"]],
			});
			toast.success(m["toast.collection_deleted"]());
			navigate({ to: "/dashboard/collections" });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: m["toast.collection_delete_failed"](),
			);
		},
	});

	const detailsQuery = useQuery({
		...orpc.collections.getDetails.queryOptions({
			input: { collectionId },
		}),
		staleTime: 30_000,
		enabled: canRead,
	});
	const itemsQuery = useInfiniteQuery({
		...orpc.collections.listItems.infiniteOptions({
			input: (pageParam: number) => ({
				collectionId,
				cursor: pageParam,
				limit: 30,
				query: query || undefined,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
			initialPageParam: 0,
			getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
			staleTime: 30_000,
		}),
		enabled: canRead,
	});

	const collection = detailsQuery.data?.collection;
	const books = itemsQuery.data?.pages.flatMap((page) => page.items) ?? [];
	const totalHits = itemsQuery.data?.pages[0]?.pagination.totalHits;
	const invalidDefinition =
		itemsQuery.data?.pages[0]?.definitionStatus === "invalid";

	if (!abilitiesLoading && !canRead) {
		return (
			<CollectionView
				title={m["nav.collections"]()}
				isLoading={false}
				search=""
				onSearchChange={() => undefined}
				searchPlaceholder=""
				searchAriaLabel=""
				isSearching={false}
				query=""
				sort="none"
				onSortChange={() => undefined}
				items={[]}
				getKey={() => "unavailable"}
				gridRowEstimate={COLLECTION_CARD_ROW_ESTIMATE}
				renderGridItem={() => null}
				emptyState={
					<EmptyState
						title={m["collection.unavailable_title"]()}
						description={m["collection.unavailable_desc"]()}
					/>
				}
			/>
		);
	}

	return (
		<>
			<BookContextMenuRoot>
				<CollectionView
					beforeToolbar={
						<Link
							to="/dashboard/collections"
							className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
						>
							<ArrowLeft className="size-4" />
							{m["shelves.back"]()}
						</Link>
					}
					title={collection?.name ?? m["nav.collections"]()}
					subtitle={
						collection
							? [
									m["collection.subtitle"]({
										count: totalHits ?? collection.bookCount ?? 0,
									}),
									collection.description,
								]
									.filter(Boolean)
									.join(" · ")
							: undefined
					}
					isLoading={detailsQuery.isLoading || itemsQuery.isLoading}
					isError={detailsQuery.isError || itemsQuery.isError}
					errorState={
						<QueryErrorState
							onRetry={() =>
								void Promise.all([detailsQuery.refetch(), itemsQuery.refetch()])
							}
						/>
					}
					isFetching={detailsQuery.isFetching || itemsQuery.isFetching}
					isFetchingNextPage={itemsQuery.isFetchingNextPage}
					search={search}
					onSearchChange={setSearch}
					searchPlaceholder={m["collection.detail_search_placeholder"]()}
					searchAriaLabel={m["collection.detail_search_aria"]()}
					isSearching={Boolean(query)}
					query={query}
					sort="none"
					onSortChange={() => undefined}
					extraActions={
						collection ? (
							<div className="flex items-center gap-2">
								{collection.isOwner &&
									collection.kind === "dynamic" &&
									canUpdate && (
										<Button
											type="button"
											size="lg"
											variant="outline"
											render={
												<Link
													to="/dashboard/collections/$collectionId/edit"
													params={{ collectionId }}
												/>
											}
										>
											<PencilSimple data-icon="inline-start" />
											{m["collection.edit_rules"]()}
										</Button>
									)}
								{!collection.isOwner && (
									<Link
										to="/dashboard/user/$username"
										params={{ username: collection.ownerUsername }}
										className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-muted-foreground text-sm transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
									>
										<UserAvatar
											name={collection.ownerName}
											image={collection.ownerImage}
											className="size-5 shrink-0"
										/>
										@{collection.ownerUsername}
									</Link>
								)}
								{collection.isOwner && canDelete && (
									<Button
										type="button"
										size="lg"
										variant="destructive"
										onClick={() => setDeleteOpen(true)}
									>
										<Trash className="size-4" data-icon="inline-start" />
										{m["common.delete"]()}
									</Button>
								)}
							</div>
						) : undefined
					}
					contentBefore={
						collection?.kind === "dynamic" &&
						collection.definitionStatus === "valid" ? (
							<details className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
								<summary className="cursor-pointer font-medium">
									{m["collection.detail_rules_summary"]()}
								</summary>
								<p className="mt-2 text-muted-foreground">
									{summarizeDefinition(
										collection.dynamicDefinition as DynamicCollectionDefinitionV1,
									)}
								</p>
							</details>
						) : undefined
					}
					items={books}
					getKey={(book) => book.uuid}
					hasNextPage={itemsQuery.hasNextPage}
					fetchNextPage={() => void itemsQuery.fetchNextPage()}
					gridRowEstimate={COLLECTION_CARD_ROW_ESTIMATE}
					renderGridItem={(book) => (
						<BookContextMenuTrigger
							bookUuid={book.uuid}
							mediaType={book.mediaType === "audiobook" ? "audiobook" : "ebook"}
						>
							<BookCard
								uuid={book.uuid}
								title={book.title ?? null}
								filename={book.filename}
								cover={book.cover ?? null}
								tint={book.mainColor}
								authors={book.authors}
								contextMenuEnabled={false}
								mediaType={
									book.mediaType === "audiobook" ? "audiobook" : "ebook"
								}
							/>
						</BookContextMenuTrigger>
					)}
					emptyState={
						<EmptyState
							title={
								invalidDefinition
									? collection?.isOwner
										? m["collection.detail_rules_repair_title"]()
										: m["collection.unavailable_title"]()
									: m["collection.detail_empty_title"]()
							}
							description={
								invalidDefinition
									? collection?.isOwner
										? m["collection.detail_rules_repair_desc"]()
										: m["collection.detail_unavailable_desc"]()
									: collection?.kind === "dynamic"
										? m["collection.detail_empty_dynamic_desc"]()
										: m["collection.detail_empty_manual_desc"]()
							}
						/>
					}
					searchEmptyState={
						<EmptyState
							title={m["settings.no_matches"]()}
							description={m["collection.detail_empty_search_desc"]()}
						/>
					}
				/>
			</BookContextMenuRoot>
			{collection && (
				<Modal
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					title={m["collection.delete_title"]()}
					description={m["collection.delete_desc"]({ name: collection.name })}
					footer={
						<>
							<Button
								type="button"
								variant="outline"
								disabled={deleteCollectionMutation.isPending}
								onClick={() => setDeleteOpen(false)}
							>
								{m["common.cancel"]()}
							</Button>
							<Button
								type="button"
								disabled={deleteCollectionMutation.isPending}
								onClick={() => deleteCollectionMutation.mutate()}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{deleteCollectionMutation.isPending && (
									<CircleNotch
										className="animate-spin"
										data-icon="inline-start"
									/>
								)}
								{m["common.delete"]()}
							</Button>
						</>
					}
				/>
			)}
		</>
	);
}

function summarizeDefinition(definition: DynamicCollectionDefinitionV1) {
	const summarizeGroup = (
		group: DynamicCollectionDefinitionV1["root"],
	): string =>
		group.children
			.map((child) => {
				if (child.kind === "group") return `(${summarizeGroup(child)})`;
				const value =
					child.value == null
						? ""
						: Array.isArray(child.value)
							? child.value
									.map((item) => (typeof item === "object" ? item.label : item))
									.join(", ")
							: typeof child.value === "object"
								? JSON.stringify(child.value)
								: String(child.value);
				return `${child.field} ${child.operator}${value ? ` ${value}` : ""}`;
			})
			.join(group.match === "all" ? " AND " : " OR ");
	const sort = definition.sort
		.map((item) => `${item.field} ${item.direction}`)
		.join(", ");
	return `${summarizeGroup(definition.root)}${sort ? `. Sorted by ${sort}.` : ""}`;
}
