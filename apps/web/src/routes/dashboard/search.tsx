import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { BookCard } from "@/components/book-card";
import { getUser } from "@/functions/get-user";
import { orpc } from "@/utils/orpc";

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

	const { data: books, isLoading } = useQuery({
		...orpc.books.search.queryOptions({
			input: { query: q },
		}),
		enabled: q.length > 0,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			{q && (
				<h1 className="font-semibold text-xl">
					Results for &ldquo;{q}&rdquo;
				</h1>
			)}

			{isLoading && q && (
				<p className="text-muted-foreground text-sm">Searching...</p>
			)}

			{books && books.length > 0 && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{books.map((book: any) => (
						<BookCard
							key={book.id}
							uuid={book.uuid}
							title={book.title ?? null}
							filename={book.filename}
							cover={book.cover ?? null}
							authors={book.authors}
						/>
					))}
				</div>
			)}

			{books && books.length === 0 && q && !isLoading && (
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
