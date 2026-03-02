import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { BookCard } from "@/components/book-card";
import { getUser } from "@/functions/get-user";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/search")({
	component: SearchPage,
	validateSearch: (search: Record<string, unknown>) => ({
		q: (search.q as string) || "",
	}),
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

const browseCategories = [
	{
		label: "Japanese",
		query: "Japanese",
		colorFrom: "from-rose-600",
		colorTo: "to-pink-500",
	},
	{
		label: "English",
		query: "English",
		colorFrom: "from-indigo-600",
		colorTo: "to-blue-500",
	},
	{
		label: "Light Novels",
		query: "Light Novel",
		colorFrom: "from-violet-600",
		colorTo: "to-purple-500",
	},
	{
		label: "Manga",
		query: "Manga",
		colorFrom: "from-amber-600",
		colorTo: "to-orange-500",
	},
	{
		label: "Recently Added",
		query: "new",
		colorFrom: "from-emerald-600",
		colorTo: "to-green-500",
	},
	{
		label: "Non-Fiction",
		query: "Non-Fiction",
		colorFrom: "from-teal-600",
		colorTo: "to-cyan-500",
	},
	{
		label: "Fantasy",
		query: "Fantasy",
		colorFrom: "from-fuchsia-600",
		colorTo: "to-pink-500",
	},
	{
		label: "Favorites",
		query: "favorites",
		colorFrom: "from-red-600",
		colorTo: "to-rose-500",
	},
];

function SearchPage() {
	const { q } = Route.useSearch();
	const navigate = useNavigate();
	const observerRef = useRef<IntersectionObserver | null>(null);

	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: ["books", "search", q],
			queryFn: async ({ pageParam }) => {
				return client.books.search({
					query: q || undefined,
					cursor: pageParam ?? undefined,
					limit: 30,
				});
			},
			initialPageParam: undefined as string | undefined,
			getNextPageParam: (lastPage) => lastPage.pagination.cursor,
			enabled: q.length > 0,
		});

	const books = data?.pages.flatMap((page) => page.books) ?? [];
	const totalHits = data?.pages[0]?.pagination.totalHits;

	const lastBookRef = useCallback(
		(node: HTMLElement | null) => {
			if (isFetchingNextPage) return;
			if (observerRef.current) observerRef.current.disconnect();
			observerRef.current = new IntersectionObserver((entries) => {
				if (entries[0].isIntersecting && hasNextPage) {
					fetchNextPage();
				}
			});
			if (node) observerRef.current.observe(node);
		},
		[isFetchingNextPage, hasNextPage, fetchNextPage],
	);

	return (
		<div className="space-y-6 p-6 lg:p-8">
			{q && (
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold text-xl">
						Results for &ldquo;{q}&rdquo;
					</h1>
					{totalHits != null && totalHits > 0 && (
						<span className="text-muted-foreground text-sm">
							{totalHits.toLocaleString()} found
						</span>
					)}
				</div>
			)}

			{isLoading && q && (
				<p className="text-muted-foreground text-sm">Searching...</p>
			)}

			{books.length > 0 && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{books.map((book: any, index: number) => (
						<div
							key={book.id}
							ref={index === books.length - 1 ? lastBookRef : undefined}
						>
							<BookCard
								uuid={book.uuid}
								title={book.highlight?.title ? undefined : (book.title ?? null)}
								titleHtml={book.highlight?.title}
								filename={book.filename}
								cover={book.cover ?? null}
								authors={book.authors}
							/>
						</div>
					))}
				</div>
			)}

			{isFetchingNextPage && (
				<p className="text-center text-muted-foreground text-sm">
					Loading more...
				</p>
			)}

			{books.length === 0 && q && !isLoading && (
				<p className="text-muted-foreground text-sm">
					No results for &ldquo;{q}&rdquo;
				</p>
			)}

			{!q && (
				<div>
					<h2 className="mb-4 font-semibold text-xl">Browse all</h2>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
						{browseCategories.map((cat) => (
							<button
								key={cat.label}
								type="button"
								onClick={() =>
									navigate({
										to: "/dashboard/search",
										search: { q: cat.query },
									})
								}
								className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${cat.colorFrom} ${cat.colorTo} p-5 pb-8 text-left font-bold text-base text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]`}
							>
								{cat.label}
								{/* Decorative circle */}
								<div className="absolute -right-3 -bottom-3 size-16 rounded-full bg-white/10" />
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
