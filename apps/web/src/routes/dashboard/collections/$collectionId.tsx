import { ArrowLeft, CircleNotch, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
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
	const [deleteOpen, setDeleteOpen] = useState(false);

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

	const collection = detailsQuery.data?.collection;
	const books = detailsQuery.data?.books ?? [];

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

			{detailsQuery.isLoading && (
				<div className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-muted-foreground text-sm">
					<CircleNotch className="size-4 animate-spin" />
					{m["collection.loading"]()}
				</div>
			)}

			{detailsQuery.isError && (
				<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
					Unable to load this collection.
				</p>
			)}

			{collection && (
				<>
					<CollectionToolbar
						title={collection.name}
						subtitle={[
							m["collection.subtitle"]({ count: collection.bookCount }),
							collection.description,
						]
							.filter(Boolean)
							.join(" · ")}
						actions={
							!collection.isOwner || canDelete ? (
								<div className="flex items-center gap-2">
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
					/>

					{books.length === 0 ? (
						<EmptyState
							title="No books yet"
							description="This collection has no books yet. Add books from your library."
						/>
					) : (
						<BookContextMenuRoot>
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
													book.mediaType === "audiobook" ? "audiobook" : "ebook"
												}
											/>
										</BookContextMenuTrigger>
										<p className="px-2 text-[11px] text-muted-foreground">
											Added {formatDate(book.addedAt) ?? "recently"}
										</p>
									</div>
								))}
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
