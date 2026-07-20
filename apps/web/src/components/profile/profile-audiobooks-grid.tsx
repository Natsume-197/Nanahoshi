import {
	CaretDoubleLeft,
	CaretDoubleRight,
	CaretLeft,
	CaretRight,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import type { AudiobookShelfStatus } from "@/components/profile/book-shelf-sections";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
import { BOOK_GRID_CLASS, coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const STATUS_FILTERS: Array<{
	status: AudiobookShelfStatus | undefined;
	label: string;
}> = [
	{ status: undefined, label: "All" },
	{ status: "listening", label: "Listening" },
	{ status: "completed", label: "Completed" },
	{ status: "backlog", label: "Backlog" },
	{ status: "want_to_listen", label: "Want to Listen" },
];

const PAGE_SIZE = 40;
const SKELETON_KEYS = Array.from({ length: 20 }, (_, index) => `sk-${index}`);

interface ProfileAudiobooksGridProps {
	username: string;
	status?: AudiobookShelfStatus;
	onStatusChange: (status: AudiobookShelfStatus | undefined) => void;
}

export function ProfileAudiobooksGrid({
	username,
	status: activeStatus,
	onStatusChange,
}: ProfileAudiobooksGridProps) {
	const [page, setPage] = useUiSnapshotState("profile-audiobooks-page", 0);
	const prevStatusRef = useRef(activeStatus);

	if (activeStatus !== prevStatusRef.current) {
		prevStatusRef.current = activeStatus;
		setPage(0);
	}

	const { data, isLoading } = useQuery({
		...orpc.audiobookShelf.getPublicShelfPaginated.queryOptions({
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

	const handleStatusChange = (status: AudiobookShelfStatus | undefined) => {
		onStatusChange(status);
		setPage(0);
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="font-medium text-muted-foreground text-sm tabular-nums">
					{isLoading ? (
						<Skeleton as="span" className="inline-block h-4 w-16 rounded" />
					) : (
						<>
							{total} {total === 1 ? "Audiobook" : "Audiobooks"}
						</>
					)}
				</p>
			</div>

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

			{isLoading ? (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((id) => (
						<BookCardSkeleton key={id} square />
					))}
				</div>
			) : items.length === 0 ? (
				<EmptyState
					title="No audiobooks found"
					description={
						activeStatus
							? "No audiobooks with this status yet."
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
							mediaType="audiobook"
						/>
					))}
				</div>
			)}

			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2 pt-2">
					<Button
						variant="outline"
						size="icon"
						onClick={() => setPage(0)}
						disabled={page === 0}
						aria-label="First page"
					>
						<CaretDoubleLeft />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() => setPage((current) => Math.max(0, current - 1))}
						disabled={page === 0}
						aria-label="Previous page"
					>
						<CaretLeft />
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
						onClick={() =>
							setPage((current) => Math.min(totalPages - 1, current + 1))
						}
						disabled={page === totalPages - 1}
						aria-label="Next page"
					>
						<CaretRight />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={() => setPage(totalPages - 1)}
						disabled={page === totalPages - 1}
						aria-label="Last page"
					>
						<CaretDoubleRight />
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
		return Array.from({ length: total }, (_, page) => ({
			type: "page" as const,
			page,
			key: `p-${page}`,
		}));
	}

	const entries: PageEntry[] = [{ type: "page", page: 0, key: "p-0" }];
	const start = Math.max(1, current - 1);
	const end = Math.min(total - 2, current + 1);

	if (start > 1) entries.push({ type: "ellipsis", key: "el-start" });
	for (let page = start; page <= end; page++) {
		entries.push({ type: "page", page, key: `p-${page}` });
	}
	if (end < total - 2) {
		entries.push({ type: "ellipsis", key: "el-end" });
	}

	entries.push({ type: "page", page: total - 1, key: `p-${total - 1}` });
	return entries;
}
