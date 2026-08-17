import { ArrowLeft, CircleNotch } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import {
	type ShelfBucket,
	shelfBucketLabel,
} from "@/components/shared/shelf-card";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
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
	validateSearch: (search: Record<string, unknown>) => ({
		mediaType: search.mediaType === "audiobook" ? "audiobook" : "ebook",
	}),
	component: ShelfPage,
});

function ShelfPage() {
	const { status } = Route.useParams();
	const { mediaType } = Route.useSearch();
	const isValid = isShelfBucket(status);

	const query = useQuery({
		...orpc.shelves.list.queryOptions({
			input: { status: status as ShelfBucket, mediaType },
		}),
		staleTime: 30_000,
		enabled: isValid,
	});

	const books = query.data ?? [];

	return (
		<div className={cn(PAGE_SHELL, "space-y-6")}>
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
					<CollectionToolbar
						title={shelfBucketLabel(status, mediaType)}
						subtitle={
							!query.isLoading
								? m["media.item_count"]({ count: books.length })
								: undefined
						}
						loading={query.isFetching && !query.isLoading}
					/>

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
