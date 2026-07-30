import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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
import { client, orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const AUDIOBOOK_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator({
	square: true,
});

type SortMode = "newest" | "oldest" | "title_asc";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "title_asc", label: "Title" },
];

export const Route = createFileRoute("/dashboard/narrators/$uuid")({
	component: NarratorAudiobooksPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
});

function NarratorAudiobooksPage() {
	const { uuid } = Route.useParams();
	const { data: entity, isLoading: isNarratorLoading } = useQuery({
		...orpc.narrators.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 60_000,
	});
	const shouldSearch = entity != null;

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
		storageKey: "nh-narrator-view",
		defaultSort: "newest",
	});

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["audiobooks", "narrator", uuid, sort, query],
		queryFn: async ({ pageParam }) =>
			client.audiobooks.search({
				filters: { narratorUuids: [uuid] },
				query: query || undefined,
				sort,
				cursor: pageParam ?? undefined,
				limit: PAGE_SIZE,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const audiobooks = useMemo(
		() => data?.pages.flatMap((page) => page.audiobooks) ?? [],
		[data],
	);
	const total = data?.pages[0]?.pagination.totalHits ?? 0;

	const resolvedNarratorName = entity?.name ?? null;

	if (!isNarratorLoading && !shouldSearch) {
		return (
			<div className="p-6 lg:p-8">
				<EmptyState title="Invalid narrator" description="Unknown narrator." />
			</div>
		);
	}

	return (
		<BookContextMenuRoot mediaType="audiobook">
			<CollectionView
				title={
					resolvedNarratorName
						? `Narrated by “${resolvedNarratorName}”`
						: "Narrator"
				}
				subtitle={
					total
						? `${total.toLocaleString()} ${
								total === 1 ? "audiobook" : "audiobooks"
							}`
						: undefined
				}
				isLoading={isNarratorLoading || isLoading}
				isFetching={isFetching}
				isFetchingNextPage={isFetchingNextPage}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder="Search audiobooks…"
				searchAriaLabel="Search audiobooks by this narrator"
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={SORT_OPTIONS}
				sortAriaLabel="Sort audiobooks"
				view={view}
				onViewChange={setView}
				items={audiobooks}
				getKey={(audiobook) => audiobook.uuid}
				hasNextPage={hasNextPage}
				fetchNextPage={fetchNextPage}
				gridRowEstimate={AUDIOBOOK_CARD_ROW_ESTIMATE}
				renderGridItem={(audiobook) => (
					<BookContextMenuTrigger bookUuid={audiobook.uuid}>
						<BookCard
							uuid={audiobook.uuid}
							title={audiobook.title ?? null}
							filename={audiobook.filename}
							cover={audiobook.cover ?? null}
							tint={audiobook.mainColor}
							authors={audiobook.authors ?? undefined}
							mediaType="audiobook"
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				listHeader={<CollectionTableHeader />}
				renderListItem={(audiobook, index) => (
					<BookContextMenuTrigger bookUuid={audiobook.uuid}>
						<CollectionTableRow
							withMeta={false}
							index={index + 1}
							linkProps={{
								to: "/dashboard/audiobooks/$uuid",
								params: { uuid: audiobook.uuid },
							}}
							coverFilename={getCoverFilename(audiobook.cover)}
							title={audiobook.title ?? audiobook.filename}
							authors={audiobook.authors}
						/>
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title="No audiobooks yet"
						description="Try scanning your libraries or check the narrator name."
					/>
				}
				searchEmptyState={
					<EmptyState
						title="No matches"
						description={`No audiobooks by this narrator match “${query}”.`}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
