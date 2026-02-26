import { createFileRoute, redirect } from "@tanstack/react-router";
import { BookCard } from "@/components/book-card";
import { getRecentBooks } from "@/functions/get-recent-books";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardHome,
	beforeLoad: async () => {
		const session = await getUser();
		return { session };
	},
	loader: async ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		const recentBooks = await getRecentBooks();
		return { recentBooks };
	},
});

function getGreeting() {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 18) return "Good afternoon";
	return "Good evening";
}

function DashboardHome() {
	const { session } = Route.useRouteContext();
	const { recentBooks } = Route.useLoaderData();

	return (
		<div className="space-y-8 p-6 lg:p-8">
			<div>
				<h1 className="font-bold text-2xl tracking-tight lg:text-3xl">
					{getGreeting()}, {session?.user.name}
				</h1>
			</div>

			{recentBooks && recentBooks.length > 0 ? (
				<section>
					<h2 className="mb-4 font-semibold text-xl">Recently added</h2>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{recentBooks.map((book) => (
							<BookCard
								key={book.uuid}
								uuid={book.uuid}
								title={book.title ?? null}
								filename={book.filename}
								cover={book.cover ?? null}
								authors={book.authors}
							/>
						))}
					</div>
				</section>
			) : (
				<div className="flex flex-col items-center justify-center py-20 text-center">
					<p className="text-lg text-muted-foreground">
						No books yet. Add a library to get started.
					</p>
				</div>
			)}
		</div>
	);
}
