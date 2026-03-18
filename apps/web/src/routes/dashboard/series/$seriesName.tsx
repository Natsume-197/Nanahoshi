import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/series/$seriesName")({
	component: SeriesDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.books.listBySeries.queryOptions({
				input: { seriesName: params.seriesName },
			}),
		);
	},
});

function SeriesDetailPage() {
	const { seriesName } = Route.useParams();
	const decodedName = decodeURIComponent(seriesName);

	const { data: books, isLoading } = useQuery({
		...orpc.books.listBySeries.queryOptions({
			input: { seriesName: decodedName },
		}),
		staleTime: 30_000,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="flex items-start gap-3">
				<div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Library className="size-5" />
				</div>
				<div className="space-y-1">
					<h1 className="font-bold text-2xl tracking-tight">{decodedName}</h1>
					{books && (
						<p className="text-muted-foreground text-sm">
							{books.length} {books.length === 1 ? "book" : "books"} in this
							series
						</p>
					)}
				</div>
			</div>

			{isLoading && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{Array.from({ length: 6 }, (_, i) => (
						<BookCardSkeleton key={`s${i}`} />
					))}
				</div>
			)}

			{!isLoading && books && books.length > 0 && (
				<BookContextMenuRoot>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{books.map((book) => (
							<BookContextMenuTrigger key={book.uuid} bookUuid={book.uuid}>
								<BookCard
									uuid={book.uuid}
									title={book.title}
									filename={book.filename}
									cover={book.cover}
									contextMenuEnabled={false}
								/>
							</BookContextMenuTrigger>
						))}
					</div>
				</BookContextMenuRoot>
			)}

			{!isLoading && (!books || books.length === 0) && (
				<EmptyState
					icon={<Library className="size-5" />}
					title="No books found"
					description="This series doesn't have any books yet."
					variant="primary"
				/>
			)}
		</div>
	);
}
