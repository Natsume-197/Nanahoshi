import { env } from "@nanahoshi-v2/env/web";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { BookCard } from "@/components/book-card";
import { ScrollSection } from "@/components/scroll-section";
import {
	getRandomBooks,
	getRecentBooks,
	getRecentlyReadBooks,
} from "@/functions/get-recent-books";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardHome,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: async () => {
		const [recentBooks, recentlyReadBooks, randomBooks] = await Promise.all([
			getRecentBooks(),
			getRecentlyReadBooks(),
			getRandomBooks(),
		]);
		return { recentBooks, recentlyReadBooks, randomBooks };
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
	const { recentBooks, recentlyReadBooks, randomBooks } =
		Route.useLoaderData();

	const heroColor =
		recentlyReadBooks?.[0]?.mainColor ?? recentBooks?.[0]?.mainColor;

	return (
		<div className="relative space-y-8 p-6 lg:p-8">
			{/* Dynamic gradient hero */}
			{heroColor && (
				<div
					className="pointer-events-none absolute inset-x-0 top-0 h-[340px]"
					style={{
						background: `linear-gradient(to bottom, ${heroColor}25 0%, transparent 100%)`,
					}}
				/>
			)}

			<div className="relative">
				<h1 className="font-bold text-2xl tracking-tight lg:text-3xl">
					{getGreeting()}, {session.user.name}
				</h1>
			</div>

			{recentlyReadBooks && recentlyReadBooks.length > 0 && (
				<ScrollSection title="Continue reading">
					{recentlyReadBooks.map((entry) => (
						<div
							key={entry.bookUuid}
							className="w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px]"
						>
							<ContinueReadingCard entry={entry} />
						</div>
					))}
				</ScrollSection>
			)}

			{recentBooks && recentBooks.length > 0 ? (
				<ScrollSection title="Recently added" showAllHref="/dashboard/search">
					{recentBooks.map((book) => (
						<div
							key={book.uuid}
							className="w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px]"
						>
							<BookCard
								uuid={book.uuid}
								title={book.title ?? null}
								filename={book.filename}
								cover={book.cover ?? null}
								authors={book.authors}
							/>
						</div>
					))}
				</ScrollSection>
			) : (
				<div className="flex flex-col items-center justify-center py-20 text-center">
					<p className="text-lg text-muted-foreground">
						No books yet. Add a library to get started.
					</p>
				</div>
			)}

			{randomBooks && randomBooks.length > 0 && (
				<ScrollSection title="You might like">
					{randomBooks.map((book) => (
						<div
							key={book.uuid}
							className="w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px]"
						>
							<BookCard
								uuid={book.uuid}
								title={book.title ?? null}
								filename={book.filename}
								cover={book.cover ?? null}
								authors={book.authors}
							/>
						</div>
					))}
				</ScrollSection>
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
		mainColor?: string | null;
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
			className="group flex flex-col gap-2 rounded-lg p-2 transition-all"
		>
			<div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-white/[0.03] transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-black/40 group-hover:shadow-xl">
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
				{/* Progress overlay */}
				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2.5 pt-8">
					<div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
						<div
							className="h-full rounded-full bg-primary transition-all"
							style={{ width: `${progress}%` }}
						/>
					</div>
					<p className="mt-1 text-right font-medium text-[11px] text-white/80">
						{progress}%
					</p>
				</div>
				{/* Read overlay button */}
				<div className="absolute right-2 bottom-12 translate-y-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
					<div className="flex size-10 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 transition-transform hover:scale-110 active:scale-95">
						<BookOpen className="size-5 text-primary-foreground" />
					</div>
				</div>
			</div>
			<div className="min-w-0 space-y-0.5 px-0.5">
				<p className="line-clamp-2 font-medium text-sm leading-tight">
					{displayTitle}
				</p>
			</div>
		</Link>
	);
}
