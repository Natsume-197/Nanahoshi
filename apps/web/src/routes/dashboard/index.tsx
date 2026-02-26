import { env } from "@nanahoshi-v2/env/web";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getUser } from "@/functions/get-user";
import { useDebounce } from "@/hooks/use-debounce";
import { orpc } from "@/utils/orpc";

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
			input: { query: debouncedQuery || "" },
		}),
	);

	return (
		<div className="mx-auto max-w-4xl space-y-6 p-6">
			<div>
				<h1 className="font-bold text-3xl tracking-tight">Dashboard</h1>
				<p className="mt-2 text-muted-foreground">
					Welcome back, {session?.user.name}
				</p>
			</div>

			<Card className="p-6">
				<div className="space-y-4">
					<div className="flex flex-col gap-2">
						<label htmlFor="search" className="font-medium text-sm">
							Search Books
						</label>
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
							<p className="text-muted-foreground text-sm">Searching...</p>
						)}

						{books && books.length > 0 && (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{books.map((book: any) => (
									<Link
										key={book.id}
										to="/dashboard/books/$uuid"
										params={{ uuid: book.uuid }}
										className="flex gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-md"
									>
										{book.cover ? (
											<img
												src={`${env.VITE_SERVER_URL}/api/data/covers/${book.cover.split("/").pop()}?width=80&height=120`}
												alt={book.title}
												className="h-[120px] w-[80px] shrink-0 rounded object-cover"
											/>
										) : (
											<div className="flex h-[120px] w-[80px] shrink-0 items-center justify-center rounded bg-muted text-muted-foreground text-xs">
												No cover
											</div>
										)}
										<div className="min-w-0">
											<h3 className="line-clamp-1 font-semibold">
												{book.title}
											</h3>
											{book.description && (
												<p className="mt-1 line-clamp-3 text-muted-foreground text-sm">
													{book.description}
												</p>
											)}
										</div>
									</Link>
								))}
							</div>
						)}

						{books && books.length === 0 && debouncedQuery && !isLoading && (
							<p className="text-muted-foreground text-sm">
								No books found for "{debouncedQuery}".
							</p>
						)}
					</div>
				</div>
			</Card>
		</div>
	);
}
