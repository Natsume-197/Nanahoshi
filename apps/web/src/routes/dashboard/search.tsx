import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { BookCard } from "@/components/book-card";
import { Input } from "@/components/ui/input";
import { getUser } from "@/functions/get-user";
import { useDebounce } from "@/hooks/use-debounce";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/search")({
	component: SearchPage,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

function SearchPage() {
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query, 300);

	const { data: books, isLoading } = useQuery({
		...orpc.books.search.queryOptions({
			input: { query: debouncedQuery },
		}),
		enabled: debouncedQuery.length > 0,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="relative max-w-xl">
				<Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					placeholder="What do you want to read?"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="h-12 rounded-full pl-10 text-base"
					autoFocus
				/>
			</div>

			{isLoading && debouncedQuery && (
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

			{books && books.length === 0 && debouncedQuery && !isLoading && (
				<p className="text-muted-foreground text-sm">
					No results for "{debouncedQuery}"
				</p>
			)}

			{!debouncedQuery && (
				<div className="flex flex-col items-center justify-center py-20 text-center">
					<Search className="mb-4 size-12 text-muted-foreground/40" />
					<p className="text-lg text-muted-foreground">
						Search for books by title, author, or keyword
					</p>
				</div>
			)}
		</div>
	);
}
