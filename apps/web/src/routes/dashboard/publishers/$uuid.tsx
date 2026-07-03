import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
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
import { getErrorMessage, resolveYear } from "@/utils/format";
import { orpc, queryClient } from "@/utils/orpc";

const GRID_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

const SORT_OPTIONS: readonly SortOption<BookSortMode>[] = [
	{ value: "title", label: "Title" },
	{ value: "author", label: "Author" },
];

export const Route = createFileRoute("/dashboard/publishers/$uuid")({
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
				input: { publisherUuid: params.uuid },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.publishers.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function PublisherDetailPage() {
	const { uuid } = Route.useParams();

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
		storageKey: "nh-publisher-view",
		defaultSort: "title",
	});

	const { data: rawBooks, isLoading } = useQuery({
		...orpc.books.listByPublisher.queryOptions({
			input: { publisherUuid: uuid },
		}),
		staleTime: 30_000,
	});

	const { can } = useAbilities();
	const [editOpen, setEditOpen] = useState(false);
	const canEdit = can("book", "editMetadata");

	const { data: entity } = useQuery({
		...orpc.publishers.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});

	const updateMutation = useMutation({
		...orpc.publishers.update.mutationOptions(),
		onSuccess: () => {
			setEditOpen(false);
			toast.success("Publisher updated");
			queryClient.invalidateQueries();
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to update publisher")),
	});

	const books = useMemo(
		() => filterAndSortBooks(rawBooks ?? [], query, sort),
		[rawBooks, query, sort],
	);
	const total = rawBooks?.length ?? 0;
	const title = entity?.name ?? "Publisher";

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={title}
				subtitle={
					total
						? `${total} ${total === 1 ? "book" : "books"} from this publisher`
						: undefined
				}
				isLoading={isLoading}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search books…"
				searchAriaLabel="Search books from this publisher"
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={SORT_OPTIONS}
				sortAriaLabel="Sort books"
				view={view}
				onViewChange={setView}
				extraActions={
					canEdit && entity ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditOpen(true)}
						>
							<Pencil className="mr-1.5 size-4" />
							Edit
						</Button>
					) : undefined
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
						description="This publisher doesn't have any books yet."
					/>
				}
				searchEmptyState={
					<EmptyState
						title="No matches"
						description={`No books from this publisher match “${query}”.`}
					/>
				}
			/>

			{entity && (
				<EditEntityDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					title="Edit publisher"
					initialName={entity.name}
					isPending={updateMutation.isPending}
					onSubmit={(values) =>
						updateMutation.mutate({ uuid, name: values.name })
					}
				/>
			)}
		</BookContextMenuRoot>
	);
}
