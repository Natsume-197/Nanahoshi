import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FolderOpen, CircleNotch, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAbilities } from "@/hooks/use-abilities";
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
			await queryClient.invalidateQueries({
				queryKey: orpc.collections.list.queryOptions().queryKey,
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
			<div className="p-6 lg:p-8">
				<EmptyState
					title="Collections unavailable"
					description="You don't have permission to view collections."
				/>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<Link
				to="/dashboard/collections"
				className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to collections
			</Link>

			{detailsQuery.isLoading && (
				<div className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-muted-foreground text-sm">
					<CircleNotch className="size-4 animate-spin" />
					Loading collection...
				</div>
			)}

			{detailsQuery.isError && (
				<p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
					Unable to load this collection.
				</p>
			)}

			{collection && (
				<>
					<section className="rounded-xl border border-border/60 bg-card p-4">
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<h1 className="font-semibold text-xl tracking-tight">
									{collection.name}
								</h1>
								{collection.description && (
									<p className="text-muted-foreground text-sm">
										{collection.description}
									</p>
								)}
								{!collection.isOwner && (
									<Link
										to="/dashboard/user/$username"
										params={{ username: collection.ownerUsername }}
										className="inline-flex items-center gap-1.5 pt-1 text-muted-foreground text-sm transition-colors hover:text-foreground"
									>
										<UserAvatar
											name={collection.ownerName}
											image={collection.ownerImage}
											className="size-5 shrink-0"
										/>
										@{collection.ownerUsername}
									</Link>
								)}
							</div>
							<div className="flex items-center gap-2">
								<div className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/8 px-2.5 py-1.5 text-primary text-xs">
									<FolderOpen className="size-3.5" />
									{collection.bookCount}{" "}
									{collection.bookCount === 1 ? "book" : "books"}
								</div>
								{collection.isOwner && canDelete && (
									<>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="size-8 text-muted-foreground hover:text-destructive"
											onClick={() => setDeleteOpen(true)}
										>
											<Trash className="size-4" />
										</Button>
										<Modal
											open={deleteOpen}
											onOpenChange={setDeleteOpen}
											title={`Delete "${collection.name}"?`}
											description="This will permanently delete this collection. Books in it will not be removed from your library."
											footer={
												<>
													<Button
														type="button"
														variant="outline"
														onClick={() => setDeleteOpen(false)}
													>
														Cancel
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
														Delete
													</Button>
												</>
											}
										/>
									</>
								)}
							</div>
						</div>
					</section>

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
		</div>
	);
}
