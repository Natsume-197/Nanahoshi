import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { ProfilePagination } from "@/components/profile/profile-pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
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
	const [page, setPage] = useUiSnapshotState("profile-books-page", 0);

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
						<Skeleton as="span" className="inline-block h-4 w-16 rounded" />
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
							tint={book.mainColor}
							authors={book.authors}
							coverPreset={coverPresets.small}
						/>
					))}
				</div>
			)}

			{/* Pagination */}
			<ProfilePagination
				page={page}
				totalPages={totalPages}
				onPageChange={setPage}
			/>
		</div>
	);
}
