import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Download, Loader2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EditEntityDialog } from "@/components/catalog/edit-entity-dialog";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { useCollectionView } from "@/hooks/use-collection-view";
import { getCoverFilename } from "@/utils/covers";
import {
	type BookSortMode,
	filterAndSortBooks,
} from "@/utils/filter-sort-books";
import { formatAvgRating, getErrorMessage, resolveYear } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

const GRID_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

const SORT_OPTIONS: readonly SortOption<BookSortMode>[] = [
	{ value: "position", label: "Series order" },
	{ value: "title", label: "Title" },
	{ value: "author", label: "Author" },
];

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

	const {
		view,
		setView,
		sort,
		setSort,
		search,
		setSearch,
		query,
		isSearching,
	} = useCollectionView<BookSortMode>({
		storageKey: "nh-series-detail-view",
		defaultSort: "position",
	});

	const { data: rawBooks, isLoading } = useQuery({
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

	const { data: ratingStats } = useQuery({
		...orpc.series.ratingStats.queryOptions({ input: { name: decodedName } }),
		staleTime: 60_000,
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

	const books = useMemo(
		() => filterAndSortBooks(rawBooks ?? [], query, sort),
		[rawBooks, query, sort],
	);
	const total = rawBooks?.length ?? 0;

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={decodedName}
				subtitle={
					[
						total
							? `${total} ${total === 1 ? "book" : "books"} in this series`
							: null,
						formatAvgRating(ratingStats?.average),
					]
						.filter(Boolean)
						.join("  ·  ") || undefined
				}
				isLoading={isLoading}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search books…"
				searchAriaLabel="Search books in this series"
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={SORT_OPTIONS}
				sortAriaLabel="Sort books"
				view={view}
				onViewChange={setView}
				extraActions={
					<>
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
						{total > 0 && can("book", "download") && (
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
					</>
				}
				items={books}
				getKey={(book) => book.uuid}
				gridRowEstimate={GRID_ROW_ESTIMATE}
				renderGridItem={(book) => (
					<BookContextMenuTrigger bookUuid={book.uuid}>
						<BookCard
							uuid={book.uuid}
							title={book.title}
							filename={book.filename}
							cover={book.cover}
							authors={book.authors}
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				listHeader={<CollectionTableHeader metaLabel="Year" />}
				renderListItem={(book, index) => (
					<BookContextMenuTrigger bookUuid={book.uuid}>
						<CollectionTableRow
							index={index + 1}
							linkProps={{
								to: "/dashboard/books/$uuid",
								params: { uuid: book.uuid },
							}}
							coverFilename={getCoverFilename(book.cover)}
							title={book.title ?? book.filename}
							authors={book.authors}
							meta={resolveYear(book.publishedDate)}
						/>
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title="No books found"
						description="This series doesn't have any books yet."
					/>
				}
				searchEmptyState={
					<EmptyState
						title="No matches"
						description={`No books in this series match “${query}”.`}
					/>
				}
			/>

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
		</BookContextMenuRoot>
	);
}
