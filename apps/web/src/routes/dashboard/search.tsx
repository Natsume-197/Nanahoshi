import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Library, Loader2, Search, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ScrollSection } from "@/components/shared/scroll-section";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { coverPresets, getCoverPresetUrl } from "@/utils/covers";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/search")({
	component: SearchPage,
	validateSearch: (search: Record<string, unknown>) => ({
		q: (search.q as string) || "",
	}),
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

const SEARCH_MIN_QUERY_LENGTH = 1;

function SearchPage() {
	const { q } = Route.useSearch();
	const normalizedQuery = q.trim();
	const shouldSearch = normalizedQuery.length >= SEARCH_MIN_QUERY_LENGTH;

	const {
		data: seriesData,
		isLoading: isSeriesLoading,
	} = useQuery({
		queryKey: ["series", "search", normalizedQuery],
		queryFn: () => client.series.search({ query: normalizedQuery }),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const {
		data: authorsData,
		isLoading: isAuthorsLoading,
	} = useQuery({
		queryKey: ["authors", "search", normalizedQuery],
		queryFn: () => client.authors.search({ query: normalizedQuery }),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: ["books", "search", normalizedQuery],
			queryFn: async ({ pageParam }) => {
				return client.books.search({
					query: normalizedQuery || undefined,
					cursor: pageParam ?? undefined,
					limit: 30,
				});
			},
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.pagination.cursor,
			enabled: shouldSearch,
			staleTime: 60_000,
		});

	const books = useMemo(
		() => data?.pages.flatMap((page) => page.books) ?? [],
		[data],
	);
	const totalHits = data?.pages[0]?.pagination.totalHits;
	const series = seriesData ?? [];
	const authors = authorsData ?? [];

	const { loadMoreRef: lastBookRef } = useInfiniteScroll({
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		enabled: shouldSearch,
	});

	const isAllLoading = isLoading || isSeriesLoading || isAuthorsLoading;
	const hasNoResults =
		shouldSearch &&
		!isAllLoading &&
		books.length === 0 &&
		series.length === 0 &&
		authors.length === 0;

	const [filter, setFilter] = useState<"all" | "books" | "series" | "authors">(
		"all",
	);

	// Reset filter when query changes
	useEffect(() => {
		setFilter("all");
	}, [normalizedQuery]);

	const showSeries = filter === "all" || filter === "series";
	const showBooks = filter === "all" || filter === "books";
	const showAuthors = filter === "all" || filter === "authors";

	return (
		<div className="space-y-8 p-6 lg:p-8">
			{normalizedQuery && (
				<h1 className="font-semibold text-xl">
					Results for &ldquo;{normalizedQuery}&rdquo;
				</h1>
			)}

			{/* Filter chips */}
			{shouldSearch && !isAllLoading && (
				<div className="scrollbar-none -mx-6 flex gap-2 overflow-x-auto px-6 lg:-mx-8 lg:px-8">
					{(
						[
							{ key: "all", label: "All", visible: true },
							{ key: "books", label: "Books", visible: books.length > 0 },
							{ key: "series", label: "Series", visible: series.length > 0 },
							{ key: "authors", label: "Authors", visible: authors.length > 0 },
						] as const
					)
						.filter((chip) => chip.visible)
						.map(({ key, label }) => (
							<button
								key={key}
								type="button"
								onClick={() => setFilter(key)}
								className={cn(
									"shrink-0 rounded-full px-4 py-1.5 font-medium text-sm transition-colors",
									filter === key
										? "bg-foreground text-background"
										: "bg-muted/70 text-foreground hover:bg-muted",
								)}
							>
								{label}
							</button>
						))}
				</div>
			)}

			{normalizedQuery && !shouldSearch && (
				<p className="text-muted-foreground text-sm">
					Type at least {SEARCH_MIN_QUERY_LENGTH} character
					{SEARCH_MIN_QUERY_LENGTH === 1 ? "" : "s"} to search.
				</p>
			)}

			{isAllLoading && shouldSearch && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Searching...
				</div>
			)}

			{/* Series - Horizontal scroll */}
			{showSeries && series.length > 0 && (
				<ScrollSection title="Series">
					{series.map((s) => (
						<Link
							key={s.id}
							to="/dashboard/series/$seriesName"
							params={{ seriesName: s.name }}
							className="group flex w-36 shrink-0 flex-col gap-2 sm:w-40"
						>
							<div className="overflow-hidden rounded-lg">
								{s.cover ? (
									<img
										src={getCoverPresetUrl(
											s.cover.split("/").pop() ?? "",
											coverPresets.small,
										)}
										alt={s.name}
										className="aspect-[2/3] w-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-[1.03]"
										loading="lazy"
									/>
								) : (
									<div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-muted/70">
										<Library className="size-8 text-muted-foreground/40" />
									</div>
								)}
							</div>
							<div>
								<p className="line-clamp-2 font-medium text-sm leading-tight">
									{s.name}
								</p>
								<p className="text-muted-foreground text-xs">
									{s.bookCount} {s.bookCount === 1 ? "book" : "books"}
								</p>
							</div>
						</Link>
					))}
				</ScrollSection>
			)}

			{/* Books Grid */}
			{showBooks && books.length > 0 && (
				<section className="space-y-3">
					<div className="flex items-baseline gap-2">
						<h2 className="font-semibold text-lg">Books</h2>
						{totalHits != null && totalHits > 0 && (
							<span className="text-muted-foreground text-sm">
								{totalHits.toLocaleString()} found
							</span>
						)}
					</div>
					<BookContextMenuRoot>
						<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,160px))] gap-2">
							{books.map((book, index: number) => (
								<div
									key={book.uuid}
									ref={
										index === books.length - 1 ? lastBookRef : undefined
									}
								>
									<BookContextMenuTrigger bookUuid={book.uuid}>
										<BookCard
											uuid={book.uuid}
											title={
												book.highlight?.title
													? undefined
													: (book.title ?? null)
											}
											titleHtml={book.highlight?.title}
											filename={book.filename}
											cover={book.cover ?? null}
											authors={book.authors ?? undefined}
											coverPreset={coverPresets.small}
											contextMenuEnabled={false}
										/>
									</BookContextMenuTrigger>
								</div>
							))}
						</div>
					</BookContextMenuRoot>
				</section>
			)}

			{/* Authors - Horizontal scroll with circular avatars */}
			{showAuthors && authors.length > 0 && (
				<ScrollSection title="Authors">
					{authors.map((a) => (
						<Link
							key={a.id}
							to="/dashboard/authors/$authorId"
							params={{ authorId: String(a.id) }}
							className="group flex w-28 shrink-0 flex-col items-center gap-2 sm:w-32"
						>
							<div className="flex size-24 items-center justify-center rounded-full bg-muted/70 ring-1 ring-white/[0.05] transition-shadow duration-200 group-hover:ring-2 group-hover:ring-primary/30 sm:size-28">
								<User className="size-8 text-muted-foreground/50" />
							</div>
							<div className="text-center">
								<p className="line-clamp-2 font-medium text-sm leading-tight">
									{a.name}
								</p>
								<p className="text-muted-foreground text-xs">
									{a.bookCount} {a.bookCount === 1 ? "book" : "books"}
								</p>
							</div>
						</Link>
					))}
				</ScrollSection>
			)}

			{showBooks && isFetchingNextPage && (
				<div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading more...
				</div>
			)}

			{hasNoResults && (
				<EmptyState
					icon={<Search className="size-5" />}
					title={<>No results for &ldquo;{normalizedQuery}&rdquo;</>}
					description="Try a different search term, or check that your libraries have been scanned."
				/>
			)}

			{!normalizedQuery && (
				<EmptyState
					icon={<Search className="size-5" />}
					description="Use the search bar above to find books in your library."
				/>
			)}
		</div>
	);
}
