import { Buildings } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	BookCardShell,
	createBookCardShellRowHeightEstimator,
} from "@/components/books/book-card-shell";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { useCollectionView } from "@/hooks/use-collection-view";
import { m } from "@/paraglide/messages";
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

const publisherBookCount = (count: number) => m["media.book_count"]({ count });

export const Route = createFileRoute("/dashboard/publishers/")({
	component: PublishersPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function PublishersPage() {
	const { sort, setSort, search, setSearch, query, isSearching } =
		useCollectionView<SortMode>({
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
		isError,
		refetch,
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
			title={m["catalog_pages.publishers"]()}
			subtitle={total ? m["media.item_count"]({ count: total }) : undefined}
			isLoading={isLoading}
			isError={isError}
			errorState={<QueryErrorState onRetry={() => void refetch()} />}
			isFetching={isFetching}
			isFetchingNextPage={isFetchingNextPage}
			search={search}
			onSearchChange={setSearch}
			searchPlaceholder={m["catalog_pages.search_publishers"]()}
			searchAriaLabel={m["catalog_pages.search_publishers"]()}
			isSearching={isSearching}
			query={query}
			sort={sort}
			onSortChange={setSort}
			sortOptions={SORT_OPTIONS}
			sortAriaLabel={m["common.sort"]()}
			hideSortWhileSearching
			items={publishersList}
			getKey={(p) => p.uuid}
			hasNextPage={hasNextPage}
			fetchNextPage={fetchNextPage}
			gridRowEstimate={PUBLISHER_CARD_ROW_ESTIMATE}
			renderGridItem={(p) => (
				<BookCardShell
					linkProps={{
						to: "/dashboard/publishers/$uuid",
						params: { uuid: p.uuid },
						preload: "intent",
					}}
					ariaLabel={p.name}
					coverFilename={getCoverFilename(p.cover) ?? undefined}
					coverPreset={coverPresets.small}
					fallback={
						<div className="flex h-full w-full items-center justify-center">
							<Buildings className="size-8 text-muted-foreground/40" />
						</div>
					}
					title={p.name}
					subtitle={publisherBookCount(p.bookCount)}
				/>
			)}
			emptyState={
				<EmptyState
					title={m["catalog_pages.no_publishers"]()}
					description={m["catalog_pages.metadata_empty"]()}
				/>
			}
			searchEmptyState={
				<EmptyState
					title={m["catalog_pages.no_matches"]()}
					description={m["catalog_pages.no_query_matches"]({ query })}
				/>
			}
		/>
	);
}
