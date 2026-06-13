import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { MediaListRow } from "@/components/shared/media-list-row";
import { type SortOption, SortSelect } from "@/components/shared/sort-select";
import { type ViewMode, ViewToggle } from "@/components/shared/view-toggle";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { useDebounce } from "@/hooks/use-debounce";
import { CARD_GRID_CLASS, useGridColumns } from "@/hooks/use-grid-columns";
import { getCoverFilename } from "@/utils/covers";
import { formatNames, formatRelativeTime } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
const SKELETON_KEYS = Array.from(
	{ length: 12 },
	(_, i) => `likes-skeleton-${i}`,
);

type SortMode = "recent" | "title" | "author";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "recent", label: "Last liked" },
	{ value: "title", label: "Title" },
	{ value: "author", label: "Author" },
];

const VIEW_STORAGE_KEY = "nh-likes-view";

function readStoredView(): ViewMode {
	if (typeof window === "undefined") return "grid";
	const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
	return stored === "list" ? "list" : "grid";
}

export const Route = createFileRoute("/dashboard/likes")({
	component: LikesPage,
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

function LikesPage() {
	const [view, setView] = useState<ViewMode>(readStoredView);
	const [sort, setSort] = useState<SortMode>("recent");
	const [search, setSearch] = useState("");
	const query = useDebounce(search.trim(), 300);
	const isSearching = query.length > 0;
	const gridColumns = useGridColumns();

	const {
		data,
		isLoading,
		isFetching,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery(
		orpc.likedBooks.listLiked.infiniteOptions({
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
		...orpc.likedBooks.count.queryOptions(),
		staleTime: 30_000,
	});

	const books = useMemo(() => data?.pages.flat() ?? [], [data]);

	const handleViewChange = (next: ViewMode) => {
		setView(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(VIEW_STORAGE_KEY, next);
		}
	};

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<CollectionToolbar
				title="Likes"
				loading={isFetching && !isLoading && !isFetchingNextPage}
				subtitle={
					!isLoading && !isSearching && total
						? `${total} ${total === 1 ? "book" : "books"}`
						: undefined
				}
				actions={
					!isLoading && (books.length > 0 || isSearching) ? (
						<>
							<CollectionSearch
								value={search}
								onChange={setSearch}
								placeholder="Search likes…"
								ariaLabel="Search liked books"
							/>
							{books.length > 0 && (
								<ViewToggle view={view} onChange={handleViewChange} />
							)}
							{books.length > 0 && (
								<SortSelect
									value={sort}
									onChange={setSort}
									options={SORT_OPTIONS}
									ariaLabel="Sort books"
								/>
							)}
						</>
					) : undefined
				}
			/>

			{isLoading && (
				<div className={CARD_GRID_CLASS}>
					{SKELETON_KEYS.map((key) => (
						<BookCardSkeleton key={key} />
					))}
				</div>
			)}

			{!isLoading && books.length === 0 && (
				<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
					<div className="flex flex-col gap-1">
						<h2 className="font-semibold text-lg">
							{isSearching ? "No matches" : "No liked books yet"}
						</h2>
						<p className="max-w-md text-muted-foreground text-sm">
							{isSearching
								? `No liked books match “${query}”.`
								: "Like a book from its card, detail page, or context menu and it will appear here."}
						</p>
					</div>
				</div>
			)}

			{books.length > 0 && (
				<BookContextMenuRoot>
					{view === "grid" ? (
						<VirtualizedCardGrid
							key="grid"
							items={books}
							getKey={(book) => book.bookUuid}
							gap={8}
							columns={gridColumns}
							estimateRowHeight={360}
							hasNextPage={hasNextPage}
							isFetchingNextPage={isFetchingNextPage}
							fetchNextPage={fetchNextPage}
							renderItem={(book) => (
								<BookContextMenuTrigger bookUuid={book.bookUuid}>
									<BookCard
										uuid={book.bookUuid}
										title={book.title ?? null}
										filename={book.bookFilename}
										cover={book.cover ?? null}
										mainColor={book.mainColor}
										authors={book.authors}
										contextMenuEnabled={false}
									/>
								</BookContextMenuTrigger>
							)}
						/>
					) : (
						<VirtualizedCardGrid
							key="list"
							items={books}
							getKey={(book) => book.bookUuid}
							gap={0}
							columns={1}
							estimateRowHeight={80}
							hasNextPage={hasNextPage}
							isFetchingNextPage={isFetchingNextPage}
							fetchNextPage={fetchNextPage}
							renderItem={(book) => (
								<BookContextMenuTrigger bookUuid={book.bookUuid}>
									<MediaListRow
										linkProps={{
											to: "/dashboard/books/$uuid",
											params: { uuid: book.bookUuid },
											preload: "intent",
										}}
										coverFilename={getCoverFilename(book.cover)}
										title={book.title ?? book.bookFilename}
										subtitle={formatNames(book.authors) || undefined}
										trailing={formatRelativeTime(book.createdAt)}
									/>
								</BookContextMenuTrigger>
							)}
						/>
					)}
				</BookContextMenuRoot>
			)}
		</div>
	);
}
