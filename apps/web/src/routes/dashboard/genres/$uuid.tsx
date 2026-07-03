import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { useCollectionView } from "@/hooks/use-collection-view";
import { getCoverFilename } from "@/utils/covers";
import {
	type BookSortMode,
	filterAndSortBooks,
} from "@/utils/filter-sort-books";
import { resolveYear } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const GRID_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

const SORT_OPTIONS: readonly SortOption<BookSortMode>[] = [
	{ value: "title", label: "Title" },
	{ value: "author", label: "Author" },
];

export const Route = createFileRoute("/dashboard/genres/$uuid")({
	component: GenreDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.books.listByGenre.queryOptions({
				input: { genreUuid: params.uuid },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.genres.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function GenreDetailPage() {
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
		storageKey: "nh-genre-view",
		defaultSort: "title",
	});

	const { data: rawBooks, isLoading } = useQuery({
		...orpc.books.listByGenre.queryOptions({
			input: { genreUuid: uuid },
		}),
		staleTime: 30_000,
	});

	const { data: entity } = useQuery({
		...orpc.genres.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});

	const books = useMemo(
		() => filterAndSortBooks(rawBooks ?? [], query, sort),
		[rawBooks, query, sort],
	);
	const total = rawBooks?.length ?? 0;
	const title = entity?.name ?? "Genre";

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={title}
				subtitle={
					total
						? `${total} ${total === 1 ? "book" : "books"} in this genre`
						: undefined
				}
				isLoading={isLoading}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search books…"
				searchAriaLabel="Search books in this genre"
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={SORT_OPTIONS}
				sortAriaLabel="Sort books"
				view={view}
				onViewChange={setView}
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
						description="This genre doesn't have any books yet."
					/>
				}
				searchEmptyState={
					<EmptyState
						title="No matches"
						description={`No books in this genre match “${query}”.`}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
