import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

const SHELF_SECTIONS: Array<{
	status: ShelfStatus;
	label: string;
	color: string;
}> = [
	{
		status: "reading",
		label: "Reading",
		color: "text-chart-1",
	},
	{
		status: "completed",
		label: "Completed",
		color: "text-chart-4",
	},
	{
		status: "backlog",
		label: "Backlog",
		color: "text-muted-foreground",
	},
	{
		status: "want_to_read",
		label: "Want to Read",
		color: "text-destructive",
	},
];

type ShelfBook = {
	bookId: number;
	status: ShelfStatus;
	updatedAt: string;
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
};

function BookCoverCard({ book }: { book: ShelfBook }) {
	const coverFilename = book.cover?.split("/").pop();
	const displayTitle = book.title ?? book.bookFilename;

	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: book.bookUuid }}
			className="group flex flex-col gap-2"
		>
			<div
				className="relative overflow-hidden rounded-lg shadow-sm ring-1 ring-white/10 transition-all duration-300 group-hover:shadow-md group-hover:ring-white/20"
				style={{ aspectRatio: "2/3" }}
			>
				{coverFilename ? (
					<img
						src={getCoverPresetUrl(coverFilename, coverPresets.card)}
						srcSet={getCoverSrcSet(coverFilename, coverPresets.card.widths)}
						sizes={coverPresets.card.sizes}
						alt={displayTitle}
						className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
						loading="lazy"
						decoding="async"
					/>
				) : (
					<div
						className="flex h-full w-full items-center justify-center bg-muted/60 p-2"
						style={
							book.mainColor
								? { backgroundColor: `${book.mainColor}33` }
								: undefined
						}
					>
						<span className="line-clamp-3 text-center text-[10px] text-muted-foreground">
							{displayTitle}
						</span>
					</div>
				)}
			</div>
			<p className="line-clamp-2 font-medium text-[12px] text-foreground/80 leading-tight group-hover:text-foreground">
				{displayTitle}
			</p>
		</Link>
	);
}

export function ShelfSection({
	status,
	label,
	data,
	isLoading,
}: {
	status: ShelfStatus;
	label: string;
	data: ShelfBook[] | undefined;
	isLoading: boolean;
}) {
	// Hide if empty
	if ((!data || data.length === 0) && !isLoading) {
		return null;
	}

	return (
		<section className="space-y-4">
			{/* Section header */}
			<div className="flex items-center gap-3 border-border/40 border-b pb-3">
				<h3 className="font-semibold text-foreground/90 text-sm tracking-tight">
					{label}
				</h3>
				{data && data.length > 0 && (
					<span className="flex items-center rounded-md bg-muted/60 px-2 py-0.5 font-bold text-[11px] text-muted-foreground/80 tabular-nums ring-1 ring-border/50">
						{data.length}
					</span>
				)}
			</div>

			{isLoading ? (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<BookCardSkeleton key={i} />
					))}
				</div>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
					{data?.map((book) => (
						<BookCoverCard key={book.bookId} book={book} />
					))}
				</div>
			)}
		</section>
	);
}

interface BookShelfSectionsProps {
	username: string;
	isOwnProfile: boolean;
}

export function BookShelfSections({
	username,
	isOwnProfile,
}: BookShelfSectionsProps) {
	const shelfQueries = useQueries({
		queries: SHELF_SECTIONS.map((section) => ({
			...orpc.bookShelf.getPublicShelf.queryOptions({
				input: { username, status: section.status, limit: 12 },
			}),
			staleTime: 60_000,
		})),
	});

	const isLoading = shelfQueries.some((q) => q.isLoading);
	const hasBooks = shelfQueries.some((q) => q.data && q.data.length > 0);

	if (!isLoading && !hasBooks) {
		return null;
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-foreground/90 text-lg">Shelf</h2>
			</div>
			<Card>
				<CardContent className="space-y-8">
					{SHELF_SECTIONS.map((section, index) => (
						<ShelfSection
							key={section.status}
							status={section.status}
							label={section.label}
							data={shelfQueries[index]?.data as ShelfBook[] | undefined}
							isLoading={shelfQueries[index]?.isLoading ?? false}
						/>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
