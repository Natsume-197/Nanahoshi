import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Download, Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EditEntityDialog } from "@/components/catalog/edit-entity-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { BOOK_GRID_CLASS } from "@/utils/covers";
import { getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

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

	const { can } = useAbilities();
	const navigate = useNavigate();
	const [isDownloading, setIsDownloading] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const canEdit = can("book", "editMetadata");

	const { data: entity } = useQuery({
		...orpc.series.getByName.queryOptions({ input: { name: decodedName } }),
		enabled: canEdit,
		staleTime: 30_000,
	});

	const renameMutation = useMutation({
		...orpc.series.rename.mutationOptions(),
		onSuccess: (_data, vars) => {
			setEditOpen(false);
			toast.success("Series updated");
			if (vars.name !== decodedName) {
				navigate({
					to: "/dashboard/series/$seriesName",
					params: { seriesName: vars.name },
				});
			} else {
				queryClient.invalidateQueries();
			}
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to update series")),
	});

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
				<div className="flex items-center gap-2">
					{canEdit && entity && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditOpen(true)}
						>
							<Pencil className="mr-1.5 size-4" />
							Edit
						</Button>
					)}
					{books && books.length > 0 && can("book", "download") && (
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
			</div>

			{entity && (
				<EditEntityDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					title="Edit series"
					initialName={entity.name}
					initialDescription={entity.description ?? ""}
					isPending={renameMutation.isPending}
					onSubmit={(values) =>
						renameMutation.mutate({
							id: entity.id,
							name: values.name,
							description: values.description,
						})
					}
				/>
			)}

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
					description="This series doesn't have any books yet."
				/>
			)}
		</div>
	);
}
