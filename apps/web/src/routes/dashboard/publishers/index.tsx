import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { useMemo } from "react";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { useCollectionView } from "@/hooks/use-collection-view";
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const PUBLISHER_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type SortMode = "name" | "books" | "recent";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Name" },
	{ value: "books", label: "Most books" },
	{ value: "recent", label: "Recently added" },
];

const publisherBookCount = (count: number) =>
	`${count} ${count === 1 ? "book" : "books"}`;

export const Route = createFileRoute("/dashboard/publishers/")({
	component: PublishersPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function PublishersPage() {
	const {
		view,
		setView,
		sort,
		setSort,
		search,
		setSearch,
		query,
		isSearching,
	} = useCollectionView<SortMode>({
		storageKey: "nh-publishers-view",
		defaultSort: "name",
	});

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery(
		orpc.publishers.list.infiniteOptions({
			input: (pageParam: number) => ({
				limit: PAGE_SIZE,
				cursor: pageParam,
				sort,
				query: query || undefined,
			}),
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
			initialPageParam: 0,
			staleTime: 30_000,
		}),
	);

	const { data: total } = useQuery({
		...orpc.publishers.count.queryOptions(),
		staleTime: 30_000,
	});

	const publishersList = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<CollectionView
			title="Publishers"
			subtitle={total ? `${total} publishers` : undefined}
			isLoading={isLoading}
			isFetching={isFetching}
			isFetchingNextPage={isFetchingNextPage}
			search={search}
			onSearchChange={setSearch}
			searchPlaceholder="Search publishers…"
			searchAriaLabel="Search publishers"
			isSearching={isSearching}
			query={query}
			sort={sort}
			onSortChange={setSort}
			sortOptions={SORT_OPTIONS}
			sortAriaLabel="Sort publishers"
			hideSortWhileSearching
			view={view}
			onViewChange={setView}
			items={publishersList}
			getKey={(p) => p.id}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={PUBLISHER_CARD_ROW_ESTIMATE}
			renderGridItem={(p) => (
				<BookCardShell
					linkProps={{
						to: "/dashboard/publishers/$publisherName",
						params: { publisherName: p.name },
						preload: "intent",
					}}
					ariaLabel={p.name}
					coverFilename={getCoverFilename(p.cover) ?? undefined}
					coverPreset={coverPresets.small}
					fallback={
						<div className="flex h-full w-full items-center justify-center">
							<Building2 className="size-8 text-muted-foreground/40" />
						</div>
					}
					title={p.name}
					subtitle={publisherBookCount(p.bookCount)}
				/>
			)}
			listHeader={
				<CollectionTableHeader withAuthor={false} metaLabel="Books" />
			}
			renderListItem={(p, index) => (
				<CollectionTableRow
					withAuthor={false}
					index={index + 1}
					linkProps={{
						to: "/dashboard/publishers/$publisherName",
						params: { publisherName: p.name },
					}}
					coverFilename={getCoverFilename(p.cover)}
					coverFallback={
						<Building2 className="size-4 text-muted-foreground/40" />
					}
					title={p.name}
					subtitle={publisherBookCount(p.bookCount)}
					meta={p.bookCount}
				/>
			)}
			emptyState={
				<EmptyState
					title="No publishers found"
					description="Publishers will appear here once your books are enriched with metadata."
				/>
			}
			searchEmptyState={
				<EmptyState
					title="No matches"
					description={`No publishers match “${query}”.`}
				/>
			}
		/>
	);
}
