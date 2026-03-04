import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookOpen, RefreshCw } from "lucide-react";
import { type JSX, type ReactNode, useState } from "react";
import { BookCard } from "@/components/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/book-context-menu";
import { ScrollSection } from "@/components/scroll-section";
import {
	getRandomBooks,
	getRecentBooks,
	getRecentlyReadBooks,
} from "@/functions/get-recent-books";
import { getUser } from "@/functions/get-user";
import { getCoverSrcSet, getCoverUrl } from "@/utils/covers";

type RandomBooks = Awaited<ReturnType<typeof getRandomBooks>>;

type ContinueReadingEntry = {
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor?: string | null;
	exploredCharCount: number | null;
	bookCharCount: number | null;
};

type ContinueReadingCardProps = {
	entry: ContinueReadingEntry;
	priority?: boolean;
};

const DASHBOARD_BOOK_TILE_CLASS =
	"w-[140px] min-w-[140px] sm:w-[160px] sm:min-w-[160px]";
const CONTINUE_READING_COVER_FALLBACK = { width: 220, height: 330 } as const;
const CONTINUE_READING_COVER_VARIANTS = [
	{ width: 140, height: 210 },
	{ width: 160, height: 240 },
	{ width: 220, height: 330 },
	{ width: 320, height: 480 },
] as const;
const CONTINUE_READING_COVER_SIZES = "(max-width: 640px) 140px, 160px";

type DashboardContextMenuBookProps = {
	bookUuid: string;
	children: ReactNode;
};

function DashboardContextMenuBook({
	bookUuid,
	children,
}: DashboardContextMenuBookProps): JSX.Element {
	return (
		<BookContextMenuTrigger bookUuid={bookUuid}>
			<div className={DASHBOARD_BOOK_TILE_CLASS}>{children}</div>
		</BookContextMenuTrigger>
	);
}

export const Route = createFileRoute("/dashboard/")({
	component: DashboardHome,
	staleTime: 30 * 60_000,
	preloadStaleTime: 30 * 60_000,
	beforeLoad: async function beforeLoad() {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: async function loader() {
		const [recentBooks, recentlyReadBooks, randomBooks] = await Promise.all([
			getRecentBooks(),
			getRecentlyReadBooks(),
			getRandomBooks(),
		]);
		return { recentBooks, recentlyReadBooks, randomBooks };
	},
});

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 18) return "Good afternoon";
	return "Good evening";
}

function DashboardHome(): JSX.Element {
	const { session } = Route.useRouteContext();
	const {
		recentBooks,
		recentlyReadBooks,
		randomBooks: loaderRandomBooks,
	} = Route.useLoaderData();
	const [randomBooks, setRandomBooks] =
		useState<RandomBooks>(loaderRandomBooks);
	const [isFetchingRandomBooks, setIsFetchingRandomBooks] = useState(false);

	async function handleRefreshRandomBooks(): Promise<void> {
		if (isFetchingRandomBooks) return;
		setIsFetchingRandomBooks(true);
		try {
			const nextBooks = await getRandomBooks();
			setRandomBooks(nextBooks);
		} finally {
			setIsFetchingRandomBooks(false);
		}
	}

	const heroColor =
		recentlyReadBooks?.[0]?.mainColor ?? recentBooks?.[0]?.mainColor;

	return (
		<BookContextMenuRoot>
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
						{recentlyReadBooks.map((entry, index) => (
							<DashboardContextMenuBook
								key={entry.bookUuid}
								bookUuid={entry.bookUuid}
							>
								<ContinueReadingCard entry={entry} priority={index === 0} />
							</DashboardContextMenuBook>
						))}
					</ScrollSection>
				)}

				{recentBooks && recentBooks.length > 0 ? (
					<ScrollSection title="Recently added" showAllHref="/dashboard/search">
						{recentBooks.map((book, index) => (
							<DashboardContextMenuBook key={book.uuid} bookUuid={book.uuid}>
								<BookCard
									uuid={book.uuid}
									title={book.title ?? null}
									filename={book.filename}
									cover={book.cover ?? null}
									authors={book.authors}
									contextMenuEnabled={false}
									priority={
										index === 0 &&
										(!recentlyReadBooks || recentlyReadBooks.length === 0)
									}
								/>
							</DashboardContextMenuBook>
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
					<ScrollSection
						title="You might like"
						headerAction={
							<button
								type="button"
								onClick={() => {
									void handleRefreshRandomBooks();
								}}
								disabled={isFetchingRandomBooks}
								className="inline-flex items-center gap-1 font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
							>
								<RefreshCw
									className={`size-3.5 ${
										isFetchingRandomBooks ? "animate-spin" : ""
									}`}
								/>
								Refresh
							</button>
						}
					>
						{randomBooks.map((book) => (
							<DashboardContextMenuBook key={book.uuid} bookUuid={book.uuid}>
								<BookCard
									uuid={book.uuid}
									title={book.title ?? null}
									filename={book.filename}
									cover={book.cover ?? null}
									authors={book.authors}
									contextMenuEnabled={false}
								/>
							</DashboardContextMenuBook>
						))}
					</ScrollSection>
				)}
			</div>
		</BookContextMenuRoot>
	);
}

function ContinueReadingCard({
	entry,
	priority = false,
}: ContinueReadingCardProps): JSX.Element {
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
						src={getCoverUrl(coverFilename, CONTINUE_READING_COVER_FALLBACK)}
						srcSet={getCoverSrcSet(
							coverFilename,
							CONTINUE_READING_COVER_VARIANTS,
						)}
						sizes={CONTINUE_READING_COVER_SIZES}
						alt={displayTitle}
						className="h-full w-full object-cover"
						loading={priority ? "eager" : "lazy"}
						fetchPriority={priority ? "high" : "auto"}
						decoding="async"
						width={160}
						height={240}
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
