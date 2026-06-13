import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Heart, LayoutGrid, List } from "lucide-react";
import { useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { likedBooksQueryOptions } from "@/hooks/books/liked-books-query";
import { cn } from "@/lib/utils";
import { getCoverFilename, getCoverUrl } from "@/utils/covers";
import { formatNames, formatRelativeTime } from "@/utils/format";

export const Route = createFileRoute("/dashboard/likes")({
	component: LikesPage,
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: ({ context }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(likedBooksQueryOptions());
	},
});

type ViewMode = "grid" | "list";
type SortMode = "recent" | "title" | "author";

const VIEW_STORAGE_KEY = "nh-likes-view";

function readStoredView(): ViewMode {
	if (typeof window === "undefined") return "grid";
	const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
	return stored === "list" ? "list" : "grid";
}

const SORT_LABELS: Record<SortMode, string> = {
	recent: "Last liked",
	title: "Title",
	author: "Author",
};

interface SortableBook {
	title: string | null;
	bookFilename: string;
	authors: { name: string }[];
}

function sortBooks<T extends SortableBook>(books: T[], sort: SortMode): T[] {
	if (sort === "recent") return books;
	const sorted = [...books];
	if (sort === "title") {
		sorted.sort((a, b) =>
			(a.title ?? a.bookFilename).localeCompare(b.title ?? b.bookFilename),
		);
	} else {
		// Books without an author sort last.
		sorted.sort((a, b) => {
			const aName = a.authors[0]?.name;
			const bName = b.authors[0]?.name;
			if (!aName && !bName) return 0;
			if (!aName) return 1;
			if (!bName) return -1;
			return aName.localeCompare(bName);
		});
	}
	return sorted;
}

const GRID_SKELETON_IDS = [
	"s1",
	"s2",
	"s3",
	"s4",
	"s5",
	"s6",
	"s7",
	"s8",
	"s9",
	"s10",
	"s11",
	"s12",
];

function LikesPage() {
	const { data: likedBooks, isLoading } = useQuery({
		...likedBooksQueryOptions(),
		staleTime: 30_000,
	});

	const [view, setView] = useState<ViewMode>(readStoredView);
	const [sort, setSort] = useState<SortMode>("recent");

	const handleViewChange = (next: ViewMode) => {
		setView(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(VIEW_STORAGE_KEY, next);
		}
	};

	const books = likedBooks ?? [];
	const sortedBooks = sortBooks(books, sort);
	const latestLike = books[0]?.createdAt;

	return (
		<div className="relative min-h-full">
			<div className="relative space-y-6 p-6 lg:p-8">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="flex items-center gap-4">
						<div className="flex size-12 shrink-0 items-center justify-center text-destructive">
							<Heart className="size-8 fill-current" />
						</div>
						<div className="space-y-1.5">
							<h1 className="font-bold text-3xl tracking-tight md:text-4xl">
								Likes
							</h1>
							{!isLoading && books.length > 0 && (
								<p className="text-muted-foreground text-sm">
									{books.length} {books.length === 1 ? "book" : "books"}
									{latestLike
										? ` · updated ${formatRelativeTime(latestLike)}`
										: null}
								</p>
							)}
						</div>
					</div>

					{!isLoading && books.length > 0 && (
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-0.5 rounded-2xl bg-input/50 p-1">
								<button
									type="button"
									aria-label="Grid view"
									aria-pressed={view === "grid"}
									onClick={() => handleViewChange("grid")}
									className={cn(
										"flex size-7 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
										view === "grid"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<LayoutGrid className="size-4" />
								</button>
								<button
									type="button"
									aria-label="List view"
									aria-pressed={view === "list"}
									onClick={() => handleViewChange("list")}
									className={cn(
										"flex size-7 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
										view === "list"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									<List className="size-4" />
								</button>
							</div>
							<Select
								value={sort}
								onValueChange={(value) => setSort(value as SortMode)}
							>
								<SelectTrigger aria-label="Sort books">
									<SelectValue>{SORT_LABELS[sort]}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="recent">Last liked</SelectItem>
									<SelectItem value="title">Title</SelectItem>
									<SelectItem value="author">Author</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}
				</div>

				{isLoading ? (
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{GRID_SKELETON_IDS.map((id) => (
							<BookCardSkeleton key={id} />
						))}
					</div>
				) : null}

				{!isLoading && sortedBooks.length > 0 ? (
					<BookContextMenuRoot>
						{view === "grid" ? (
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
								{sortedBooks.map((book) => (
									<BookContextMenuTrigger
										key={book.bookUuid}
										bookUuid={book.bookUuid}
									>
										<BookCard
											uuid={book.bookUuid}
											title={book.title ?? null}
											filename={book.bookFilename}
											cover={book.cover ?? null}
											mainColor={book.mainColor}
											authors={book.authors}
											contextMenuEnabled={false}
										/>
									</BookContextMenuTrigger>
								))}
							</div>
						) : (
							<div className="flex flex-col">
								{sortedBooks.map((book) => {
									const coverFilename = getCoverFilename(book.cover);
									const authorText = formatNames(book.authors);
									return (
										<BookContextMenuTrigger
											key={book.bookUuid}
											bookUuid={book.bookUuid}
										>
											<Link
												to="/dashboard/books/$uuid"
												params={{ uuid: book.bookUuid }}
												preload="intent"
												className="flex items-center gap-4 rounded-lg px-3 py-2 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
											>
												<div className="h-16 w-[2.7rem] shrink-0 overflow-hidden rounded bg-muted shadow-sm">
													{coverFilename ? (
														<img
															src={getCoverUrl(coverFilename, 120)}
															alt=""
															loading="lazy"
															decoding="async"
															className="h-full w-full object-cover"
														/>
													) : null}
												</div>
												<div className="min-w-0 flex-1 space-y-0.5">
													<p className="line-clamp-1 font-medium">
														{book.title ?? book.bookFilename}
													</p>
													{authorText && (
														<p className="line-clamp-1 text-muted-foreground text-sm">
															{authorText}
														</p>
													)}
												</div>
												<span className="shrink-0 text-muted-foreground text-xs">
													{formatRelativeTime(book.createdAt)}
												</span>
											</Link>
										</BookContextMenuTrigger>
									);
								})}
							</div>
						)}
					</BookContextMenuRoot>
				) : null}

				{!isLoading && books.length === 0 ? (
					<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-border/70 border-dashed bg-card/30 px-6 text-center">
						<div className="flex flex-col gap-1">
							<h2 className="font-semibold text-lg">No liked books yet</h2>
							<p className="max-w-md text-muted-foreground text-sm">
								Like a book from its card, detail page, or context menu and it
								will appear here.
							</p>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
