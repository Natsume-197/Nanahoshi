import { useQuery } from "@tanstack/react-query";
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { useRef, useState } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { BOOK_GRID_CLASS, coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

const STATUS_FILTERS: Array<{
	status: ShelfStatus | undefined;
	label: string;
}> = [
	{ status: undefined, label: "All" },
	{ status: "reading", label: "Reading" },
	{ status: "completed", label: "Completed" },
	{ status: "backlog", label: "Backlog" },
	{ status: "want_to_read", label: "Want to Read" },
];

const PAGE_SIZE = 40;

const SKELETON_KEYS = Array.from({ length: 20 }, (_, i) => `sk-${i}`);

interface ProfileBooksGridProps {
	username: string;
	status?: ShelfStatus;
	onStatusChange: (status: ShelfStatus | undefined) => void;
}

export function ProfileBooksGrid({
	username,
	status: activeStatus,
	onStatusChange,
}: ProfileBooksGridProps) {
	const [page, setPage] = useState(0);

	// Status is owned by the URL; reset pagination when it changes externally.
	const prevStatusRef = useRef(activeStatus);
	if (activeStatus !== prevStatusRef.current) {
		prevStatusRef.current = activeStatus;
		setPage(0);
	}

	const { data, isLoading } = useQuery({
		...orpc.bookShelf.getPublicShelfPaginated.queryOptions({
			input: {
				username,
				status: activeStatus,
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
			},
		}),
		staleTime: 60_000,
	});

	const total = data?.total ?? 0;
	const items = data?.items ?? [];
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const handleStatusChange = (status: ShelfStatus | undefined) => {
		onStatusChange(status);
		setPage(0);
	};

	return (
		<div className="space-y-4">
			{/* Header with count */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="font-medium text-muted-foreground text-sm tabular-nums">
					{isLoading ? (
						<span className="inline-block h-4 w-16 animate-pulse rounded bg-muted" />
					) : (
						<>
							{total} {total === 1 ? "Book" : "Books"}
						</>
					)}
				</p>
			</div>

			{/* Status filter pills */}
			<div className="flex flex-wrap gap-2.5">
				{STATUS_FILTERS.map((filter) => (
					<Button
						key={filter.label}
						variant={activeStatus === filter.status ? "default" : "outline"}
						size="sm"
						onClick={() => handleStatusChange(filter.status)}
					>
						{filter.label}
					</Button>
				))}
			</div>

			{/* Book grid */}
			{isLoading ? (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((id) => (
						<BookCardSkeleton key={id} />
					))}
				</div>
			) : items.length === 0 ? (
				<EmptyState
					title="No books found"
					description={
						activeStatus
							? "No books with this status yet."
							: "This shelf is empty."
					}
				/>
			) : (
				<div className={BOOK_GRID_CLASS}>
					{items.map((book) => (
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

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2 pt-2">
					<Button
						variant="outline"
						size="icon"
						onClick={() => setPage(0)}
						disabled={page === 0}
						aria-label="First page"
					>
						<ChevronsLeft className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() => setPage((p) => Math.max(0, p - 1))}
						disabled={page === 0}
						aria-label="Previous page"
					>
						<ChevronLeft className="size-4" />
					</Button>

					<div className="flex items-center gap-2">
						{generatePageNumbers(page, totalPages).map((entry) =>
							entry.type === "ellipsis" ? (
								<span
									key={entry.key}
									className="px-1 text-muted-foreground text-xs"
								>
									...
								</span>
							) : (
								<Button
									key={entry.key}
									variant={page === entry.page ? "default" : "outline"}
									size="icon"
									onClick={() => setPage(entry.page)}
									aria-label={`Page ${entry.page + 1}`}
									aria-current={page === entry.page ? "page" : undefined}
								>
									{entry.page + 1}
								</Button>
							),
						)}
					</div>

					<Button
						variant="outline"
						size="icon"
						onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
						disabled={page === totalPages - 1}
						aria-label="Next page"
					>
						<ChevronRight className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() => setPage(totalPages - 1)}
						disabled={page === totalPages - 1}
						aria-label="Last page"
					>
						<ChevronsRight className="size-4" />
					</Button>
				</div>
			)}
		</div>
	);
}

type PageEntry =
	| { type: "page"; page: number; key: string }
	| { type: "ellipsis"; key: string };

function generatePageNumbers(current: number, total: number): PageEntry[] {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => ({
			type: "page" as const,
			page: i,
			key: `p-${i}`,
		}));
	}

	const entries: PageEntry[] = [{ type: "page", page: 0, key: "p-0" }];

	const start = Math.max(1, current - 1);
	const end = Math.min(total - 2, current + 1);

	if (start > 1) entries.push({ type: "ellipsis", key: "el-start" });
	for (let i = start; i <= end; i++)
		entries.push({ type: "page", page: i, key: `p-${i}` });
	if (end < total - 2) entries.push({ type: "ellipsis", key: "el-end" });

	entries.push({ type: "page", page: total - 1, key: `p-${total - 1}` });
	return entries;
}
