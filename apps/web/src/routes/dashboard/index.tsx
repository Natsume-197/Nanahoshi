import { env } from "@nanahoshi-v2/env/web";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookCard } from "@/components/book-card";
import {
	getRecentBooks,
	getRecentlyReadBooks,
} from "@/functions/get-recent-books";
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
		const [recentBooks, recentlyReadBooks] = await Promise.all([
			getRecentBooks(),
			getRecentlyReadBooks(),
		]);
		return { recentBooks, recentlyReadBooks };
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
	const { recentBooks, recentlyReadBooks } = Route.useLoaderData();

	return (
		<div className="space-y-8 p-6 lg:p-8">
			<div>
				<h1 className="font-bold text-2xl tracking-tight lg:text-3xl">
					{getGreeting()}, {session?.user.name}
				</h1>
			</div>

			{recentlyReadBooks && recentlyReadBooks.length > 0 && (
				<section>
					<h2 className="mb-4 font-semibold text-xl">Continue reading</h2>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{recentlyReadBooks.map((entry) => (
							<ContinueReadingCard key={entry.bookUuid} entry={entry} />
						))}
					</div>
				</section>
			)}

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

function ContinueReadingCard({
	entry,
}: {
	entry: {
		bookUuid: string;
		bookFilename: string;
		title: string | null;
		cover: string | null;
		exploredCharCount: number | null;
		bookCharCount: number | null;
	};
}) {
	const coverFilename = entry.cover?.split("/").pop();
	const displayTitle = entry.title ?? entry.bookFilename;
	const progress =
		entry.bookCharCount && entry.bookCharCount > 0
			? Math.min(
					Math.round(
						((entry.exploredCharCount ?? 0) / entry.bookCharCount) * 100,
					),
					100,
				)
			: 0;

	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: entry.bookUuid }}
			className="group flex flex-col gap-2 rounded-lg p-3 transition-all hover:bg-card"
		>
			<div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted shadow-sm transition-all group-hover:scale-[1.01] group-hover:shadow-lg">
				{coverFilename ? (
					<img
						src={`${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=440&height=660`}
						alt={displayTitle}
						className="h-full w-full object-cover"
						loading="lazy"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
						No cover
					</div>
				)}
				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30">
						<div
							className="h-full rounded-full bg-white transition-all"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<p className="mt-1 text-right font-medium text-white text-xs">
						{progress}%
					</p>
				</div>
			</div>
			<div className="min-w-0 space-y-0.5">
				<p className="line-clamp-2 font-medium text-sm leading-tight">
					{displayTitle}
				</p>
			</div>
		</Link>
	);
}
