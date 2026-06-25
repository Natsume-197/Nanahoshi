import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { BOOK_GRID_CLASS } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `skeleton-${i}`);

export const Route = createFileRoute("/dashboard/publishers/$publisherName")({
	component: PublisherDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.books.listByPublisher.queryOptions({
				input: { publisherName: params.publisherName },
			}),
		);
	},
});

function PublisherDetailPage() {
	const { publisherName } = Route.useParams();
	const decodedName = decodeURIComponent(publisherName);

	const { data: books, isLoading } = useQuery({
		...orpc.books.listByPublisher.queryOptions({
			input: { publisherName: decodedName },
		}),
		staleTime: 30_000,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">{decodedName}</h1>
				{books && (
					<p className="text-muted-foreground text-sm">
						{books.length} {books.length === 1 ? "book" : "books"} from this
						publisher
					</p>
				)}
			</div>

			{isLoading && (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((key) => (
						<BookCardSkeleton key={key} />
					))}
				</div>
			)}

			{!isLoading && books && books.length > 0 && (
				<BookContextMenuRoot>
					<div className={BOOK_GRID_CLASS}>
						{books.map((book) => (
							<BookContextMenuTrigger key={book.uuid} bookUuid={book.uuid}>
								<BookCard
									uuid={book.uuid}
									title={book.title}
									filename={book.filename}
									cover={book.cover}
									mainColor={book.mainColor}
									contextMenuEnabled={false}
								/>
							</BookContextMenuTrigger>
						))}
					</div>
				</BookContextMenuRoot>
			)}

			{!isLoading && (!books || books.length === 0) && (
				<EmptyState
					title="No books found"
					description="This publisher doesn't have any books yet."
				/>
			)}
		</div>
	);
}
