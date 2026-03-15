import { useQueries } from "@tanstack/react-query";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { coverPresets } from "@/utils/covers";
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
	authors?: { id?: number | null; name: string }[];
};

export function ShelfSection({
	status: _status,
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
					{["s1", "s2", "s3", "s4"].map((id) => (
						<BookCardSkeleton key={id} />
					))}
				</div>
			) : (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
					{data?.map((book) => (
						<BookCard
							key={book.bookId}
							uuid={book.bookUuid}
							title={book.title}
							filename={book.bookFilename}
							cover={book.cover}
							authors={book.authors}
							coverPreset={coverPresets.small}
						/>
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
	isOwnProfile: _isOwnProfile,
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
