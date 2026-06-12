import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { client, orpc } from "@/utils/orpc";

const SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `skeleton-${i}`);

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

	const [isDownloading, setIsDownloading] = useState(false);

	const handleDownloadSeries = async () => {
		if (isDownloading) return;
		try {
			setIsDownloading(true);
			const { url } = await client.files.getSeriesDownloadUrl({
				seriesName: decodedName,
			});
			window.open(url, "_blank", "noopener,noreferrer");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to download series",
			);
		} finally {
			setIsDownloading(false);
		}
	};

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div className="space-y-1">
					<h1 className="font-bold text-2xl tracking-tight">{decodedName}</h1>
					{books && (
						<p className="text-muted-foreground text-sm">
							{books.length} {books.length === 1 ? "book" : "books"} in this
							series
						</p>
					)}
				</div>
				{books && books.length > 0 && (
					<Button
						variant="outline"
						size="sm"
						onClick={handleDownloadSeries}
						disabled={isDownloading}
					>
						{isDownloading ? (
							<Loader2 className="mr-1.5 size-4 animate-spin" />
						) : (
							<Download className="mr-1.5 size-4" />
						)}
						Download series (.zip)
					</Button>
				)}
			</div>

			{isLoading && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{SKELETON_KEYS.map((key) => (
						<BookCardSkeleton key={key} />
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
					description="This series doesn't have any books yet."
				/>
			)}
		</div>
	);
}
