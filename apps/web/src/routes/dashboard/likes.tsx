import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { BookCard } from "@/components/books/book-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getUser } from "@/functions/get-user";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/likes")({
	component: LikesPage,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

const LIKED_BOOKS_LIMIT = 50;

function LikesPage() {
	const likedBooksQueryOptions = orpc.likedBooks.listLiked.queryOptions({
		input: { limit: LIKED_BOOKS_LIMIT },
	});
	const { data: likedBooks, isLoading } = useQuery({
		...likedBooksQueryOptions,
		staleTime: 30_000,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="flex items-start gap-3">
				<div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
					<Heart className="size-5" />
				</div>
				<div className="space-y-1">
					<h1 className="font-bold text-2xl tracking-tight">Your Likes</h1>
					<p className="text-muted-foreground text-sm">
						Books you've liked across your library.
					</p>
				</div>
			</div>

			{isLoading ? (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{Array.from({ length: 12 }).map((_, index) => (
						<div
							key={`liked-books-skeleton-${index}`}
							className="flex flex-col gap-2 p-2"
						>
							<Skeleton className="aspect-[2/3] w-full rounded-lg" />
							<Skeleton className="h-4 w-4/5 rounded" />
							<Skeleton className="h-3 w-3/5 rounded" />
						</div>
					))}
				</div>
			) : null}

			{!isLoading && likedBooks && likedBooks.length > 0 ? (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{likedBooks.map((book) => (
						<BookCard
							key={book.bookUuid}
							uuid={book.bookUuid}
							title={book.title ?? null}
							filename={book.bookFilename}
							cover={book.cover ?? null}
						/>
					))}
				</div>
			) : null}

			{!isLoading && (!likedBooks || likedBooks.length === 0) ? (
				<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/30 px-6 text-center">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
						<Heart className="size-5" />
					</div>
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-lg">No liked books yet</h2>
						<p className="max-w-md text-muted-foreground text-sm">
							Like a book from its card, detail page, or context menu and it
							will appear here.
						</p>
					</div>
				</div>
			) : null}
		</div>
	);
}
