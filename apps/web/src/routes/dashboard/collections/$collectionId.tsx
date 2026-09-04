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
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
import { useDebounce } from "@/hooks/use-debounce";
import { invalidateEverywhere } from "@/lib/invalidate-everywhere";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { BOOK_GRID_CLASS } from "@/utils/covers";
import { formatDate } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

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
			toast.success("Collection deleted");
			navigate({ to: "/dashboard/collections" });
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Failed to delete collection",
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
			<div className={PAGE_SHELL}>
				<EmptyState
					title="Collections unavailable"
					description="You don't have permission to view collections."
				/>
			</div>
		);
	}

	return (
		<div className={cn(PAGE_SHELL, "space-y-6")}>
			<Link
				to="/dashboard/collections"
				className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				{m["shelves.back"]()}
			</Link>

			{(detailsQuery.isLoading || itemsQuery.isLoading) && (
				<div className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-muted-foreground text-sm">
					<CircleNotch className="size-4 animate-spin" />
					{m["collection.loading"]()}
				</div>
			)}

			{(detailsQuery.isError || itemsQuery.isError) && (
				<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
					Unable to load this collection.
				</p>
			)}

			{collection && (
				<>
					<CollectionToolbar
						title={collection.name}
						subtitle={[
							m["collection.subtitle"]({
								count: totalHits ?? collection.bookCount ?? 0,
							}),
							collection.description,
						]
							.filter(Boolean)
							.join(" · ")}
						actions={
							<div className="flex items-center gap-2">
								<CollectionSearch
									value={search}
									onChange={setSearch}
									placeholder="Search this collection"
									ariaLabel="Search this collection"
								/>
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
						}
					/>
					{collection.kind === "dynamic" &&
						collection.definitionStatus === "valid" && (
							<details className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
								<summary className="cursor-pointer font-medium">
									How this collection is built
								</summary>
								<p className="mt-2 text-muted-foreground">
									{summarizeDefinition(
										collection.dynamicDefinition as DynamicCollectionDefinitionV1,
									)}
								</p>
							</details>
						)}

					{invalidDefinition ? (
						<EmptyState
							title={
								collection.isOwner
									? "Rules need repair"
									: "Collection unavailable"
							}
							description={
								collection.isOwner
									? "Open the rule editor and save a valid definition."
									: "This collection cannot be displayed right now."
							}
						/>
					) : books.length === 0 ? (
						<EmptyState
							title={query ? "No matches" : "No books yet"}
							description={
								query
									? "Try another search."
									: collection.kind === "dynamic"
										? "No library items match these rules yet."
										: "This collection has no books yet. Add books from your library."
							}
						/>
					) : (
						<BookContextMenuRoot>
							<div className="space-y-6">
								<div className={BOOK_GRID_CLASS}>
									{books.map((book) => (
										<div key={book.uuid} className="space-y-1">
											<BookContextMenuTrigger bookUuid={book.uuid}>
												<BookCard
													uuid={book.uuid}
													title={book.title ?? null}
													filename={book.filename}
													cover={book.cover ?? null}
													tint={book.mainColor}
													authors={book.authors}
													contextMenuEnabled={false}
													mediaType={
														book.mediaType === "audiobook"
															? "audiobook"
															: "ebook"
													}
												/>
											</BookContextMenuTrigger>
											<p className="px-2 text-[11px] text-muted-foreground">
												Added {formatDate(book.addedAt) ?? "recently"}
											</p>
										</div>
									))}
								</div>
								{itemsQuery.hasNextPage && (
									<div className="flex justify-center">
										<Button
											type="button"
											variant="outline"
											disabled={itemsQuery.isFetchingNextPage}
											onClick={() => itemsQuery.fetchNextPage()}
										>
											{itemsQuery.isFetchingNextPage && (
												<CircleNotch
													className="animate-spin"
													data-icon="inline-start"
												/>
											)}
											Load more
										</Button>
									</div>
								)}
							</div>
						</BookContextMenuRoot>
					)}
				</>
			)}
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
		</div>
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
