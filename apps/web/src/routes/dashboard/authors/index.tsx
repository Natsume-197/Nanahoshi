import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { User } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { type SortOption, SortSelect } from "@/components/shared/sort-select";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { BOOK_GRID_CLASS } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const SKELETON_KEYS = Array.from(
	{ length: 12 },
	(_, i) => `author-skeleton-${i}`,
);

type SortMode = "name" | "books";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "name", label: "Name" },
	{ value: "books", label: "Most works" },
];

const workCount = (count: number) =>
	`${count} ${count === 1 ? "work" : "works"}`;

const AUTHOR_CARD_ROW_ESTIMATE = ({ columnWidth }: { columnWidth: number }) =>
	Math.ceil(columnWidth + 64);

export const Route = createFileRoute("/dashboard/authors/")({
	component: AuthorsPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function AuthorsPage() {
	const [sort, setSort] = useState<SortMode>("name");
	const [search, setSearch] = useState("");
	const query = useDebounce(search.trim(), 300);
	const isSearching = query.length > 0;

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery(
		orpc.authors.list.infiniteOptions({
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
		...orpc.authors.count.queryOptions(),
		staleTime: 30_000,
	});

	const authorsList = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<CollectionToolbar
				title="Authors"
				loading={isFetching && !isLoading && !isFetchingNextPage}
				subtitle={
					!isLoading && !isSearching && authorsList.length > 0 && total
						? `${total} authors`
						: undefined
				}
				actions={
					!isLoading && (authorsList.length > 0 || isSearching) ? (
						<>
							<CollectionSearch
								value={search}
								onChange={setSearch}
								placeholder="Search authors…"
								ariaLabel="Search authors"
							/>
							{!isSearching && authorsList.length > 0 && (
								<SortSelect
									value={sort}
									onChange={setSort}
									options={SORT_OPTIONS}
									ariaLabel="Sort authors"
								/>
							)}
						</>
					) : undefined
				}
			/>

			{isLoading && (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((key) => (
						<div key={key} className="flex flex-col items-center gap-2">
							<Skeleton className="aspect-square w-full rounded-full" />
							<Skeleton className="h-4 w-2/3 rounded" />
						</div>
					))}
				</div>
			)}

			{!isLoading && authorsList.length === 0 && (
				<EmptyState
					title={isSearching ? "No matches" : "No authors found"}
					description={
						isSearching
							? `No authors match “${query}”.`
							: "Authors will appear here once your books are enriched with metadata."
					}
				/>
			)}

			{authorsList.length > 0 && (
				<VirtualizedCardGrid
					items={authorsList}
					getKey={(author) => author.uuid}
					gap={8}
					estimateRowHeight={AUTHOR_CARD_ROW_ESTIMATE}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					fetchNextPage={fetchNextPage}
					renderItem={(author) => (
						<Link
							to="/dashboard/authors/$uuid"
							params={{ uuid: author.uuid }}
							preload="intent"
							className="group block"
						>
							<div className="flex aspect-square items-center justify-center rounded-full bg-muted/70 transition-colors group-hover:bg-muted">
								<User className="size-8 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/60" />
							</div>
							<div className="pt-2 text-center">
								<p className="line-clamp-2 font-medium text-sm leading-tight">
									{author.name}
								</p>
								<p className="text-muted-foreground text-xs">
									{workCount(author.bookCount)}
								</p>
							</div>
						</Link>
					)}
				/>
			)}
		</div>
	);
}
