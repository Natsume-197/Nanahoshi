import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FolderOpen, Loader2 } from "lucide-react";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/collections/$collectionId")({
	component: CollectionDetailPage,
});

function formatDate(value?: string | null) {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toLocaleDateString();
}

function CollectionDetailPage() {
	const { collectionId } = Route.useParams();
	const detailsQuery = useQuery({
		...orpc.collections.getDetails.queryOptions({
			input: { collectionId },
		}),
		staleTime: 30_000,
	});

	const collection = detailsQuery.data?.collection;
	const books = detailsQuery.data?.books ?? [];

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
					<Loader2 className="size-4 animate-spin" />
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
							</div>
							<div className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/8 px-2.5 py-1.5 text-primary text-xs">
								<FolderOpen className="size-3.5" />
								{collection.bookCount}{" "}
								{collection.bookCount === 1 ? "book" : "books"}
							</div>
						</div>
					</section>

					{books.length === 0 ? (
						<div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
							<div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
								<FolderOpen className="size-5" />
							</div>
							<p className="text-muted-foreground text-sm">
								This collection has no books yet.
							</p>
						</div>
					) : (
						<BookContextMenuRoot>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
