import { ArrowLeft, CircleNotch } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import {
	type ShelfBucket,
	shelfBucketLabel,
} from "@/components/shared/shelf-card";
import { m } from "@/paraglide/messages";
import { BOOK_GRID_CLASS } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const SHELF_BUCKETS: readonly ShelfBucket[] = [
	"want",
	"reading",
	"backlog",
	"completed",
];

function isShelfBucket(value: string): value is ShelfBucket {
	return (SHELF_BUCKETS as readonly string[]).includes(value);
}

export const Route = createFileRoute("/dashboard/shelves/$status")({
	component: ShelfPage,
});

function ShelfPage() {
	const { status } = Route.useParams();
	const isValid = isShelfBucket(status);

	const query = useQuery({
		...orpc.shelves.list.queryOptions({
			input: { status: status as ShelfBucket },
		}),
		staleTime: 30_000,
		enabled: isValid,
	});

	const books = query.data ?? [];

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<Link
				to="/dashboard/collections"
				className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				{m["shelves.back"]()}
			</Link>

			{!isValid ? (
				<EmptyState
					title={m["shelves.not_found_title"]()}
					description={m["shelves.not_found_desc"]()}
				/>
			) : (
				<>
					<section className="rounded-xl border border-border/60 bg-card p-4">
						<div className="flex items-center justify-between gap-4">
							<h1 className="font-semibold text-xl tracking-tight">
								{shelfBucketLabel(status)}
							</h1>
							{!query.isLoading && (
								<div className="rounded-md border border-primary/20 bg-primary/8 px-2.5 py-1.5 text-primary text-xs tabular-nums">
									{m["media.item_count"]({ count: books.length })}
								</div>
							)}
						</div>
					</section>

					{query.isLoading && (
						<div className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-muted-foreground text-sm">
							<CircleNotch className="size-4 animate-spin" />
							{m["common.loading"]()}
						</div>
					)}

					{!query.isLoading && books.length === 0 ? (
						<EmptyState
							title={m["shelves.empty_title"]()}
							description={m["shelves.empty_desc"]()}
						/>
					) : (
						<BookContextMenuRoot>
							<div className={BOOK_GRID_CLASS}>
								{books.map((book) => (
									<BookContextMenuTrigger
										key={book.bookUuid}
										bookUuid={book.bookUuid}
										mediaType={book.mediaType}
									>
										<BookCard
											uuid={book.bookUuid}
											title={book.title ?? null}
											filename={book.filename}
											cover={book.cover ?? null}
											tint={book.mainColor}
											authors={book.authors}
											contextMenuEnabled={false}
											mediaType={book.mediaType}
										/>
									</BookContextMenuTrigger>
								))}
							</div>
						</BookContextMenuRoot>
					)}
				</>
			)}
		</div>
	);
}
