import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getUser } from "@/functions/get-user";
import { orpc } from "@/utils/orpc";
import { useDebounce } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard/")({
	component: RouteComponent,
	beforeLoad: async () => {
		const session = await getUser();
		return { session };
	},
	loader: async ({ context }) => {
		if (!context.session) {
			throw redirect({
				to: "/login",
			});
		}
	},
});

function RouteComponent() {
	const { session } = Route.useRouteContext();
	const [searchQuery, setSearchQuery] = useState("");
	const debouncedQuery = useDebounce(searchQuery, 300);

	const { data: books, isLoading } = useQuery(
		orpc.books.search.queryOptions({
			input: { query: debouncedQuery || "" }
		})
	);

	return (
		<div className="p-6 max-w-4xl mx-auto space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
				<p className="text-muted-foreground mt-2">Welcome back, {session?.user.name}</p>
			</div>

			<Card className="p-6">
				<div className="space-y-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="search" className="text-sm font-medium">Search Books</label>
						<Input 
							id="search"
							type="search" 
							placeholder="Search for a book by title or author..." 
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="max-w-md"
						/>
					</div>

					<div className="pt-4">
						{isLoading && debouncedQuery && (
							<p className="text-sm text-muted-foreground">Searching...</p>
						)}

						{books && books.length > 0 && (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{books.map((book: any) => (
									<div key={book.id} className="p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow bg-card text-card-foreground">
										<h3 className="font-semibold line-clamp-1">{book.title}</h3>
										{book.description && (
											<p className="text-sm text-muted-foreground line-clamp-2 mt-1">
												{book.description}
											</p>
										)}
									</div>
								))}
							</div>
						)}

						{books && books.length === 0 && debouncedQuery && !isLoading && (
							<p className="text-sm text-muted-foreground">No books found for "{debouncedQuery}".</p>
						)}
					</div>
				</div>
			</Card>
		</div>
	);
}
