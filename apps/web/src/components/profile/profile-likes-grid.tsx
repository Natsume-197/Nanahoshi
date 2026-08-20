import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { ProfilePagination } from "@/components/profile/profile-pagination";
import type { LikedFormat } from "@/components/profile/profile-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
import { m } from "@/paraglide/messages";
import { BOOK_GRID_CLASS, coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

// Books and audiobooks are separate queries over separate metadata tables, so
// the filter picks one — there's no combined "All" the way shelves have.
const FORMAT_FILTERS: Array<{ format: LikedFormat; label: string }> = [
	{ format: "books", label: "Books" },
	{ format: "audiobooks", label: "Audiobooks" },
];

const PAGE_SIZE = 40;
const SKELETON_KEYS = Array.from({ length: 20 }, (_, index) => `sk-${index}`);

interface ProfileLikesGridProps {
	format: LikedFormat;
	onFormatChange: (format: LikedFormat) => void;
}

export function ProfileLikesGrid({
	format,
	onFormatChange,
}: ProfileLikesGridProps) {
	const [page, setPage] = useUiSnapshotState("profile-likes-page", 0);
	const isAudiobook = format === "audiobooks";

	// Format is owned by the URL; reset pagination when it changes externally.
	const prevFormatRef = useRef(format);
	if (format !== prevFormatRef.current) {
		prevFormatRef.current = format;
		setPage(0);
	}

	const {
		data: items,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		...orpc.likedBooks.listLiked.queryOptions({
			input: { limit: PAGE_SIZE, cursor: page * PAGE_SIZE, format },
		}),
		staleTime: 60_000,
	});
	const {
		data: total,
		isLoading: isCountLoading,
		isError: isCountError,
		refetch: refetchCount,
	} = useQuery({
		...orpc.likedBooks.count.queryOptions({ input: { format } }),
		staleTime: 60_000,
	});

	const books = items ?? [];
	const totalPages = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));

	const handleFormatChange = (next: LikedFormat) => {
		onFormatChange(next);
		setPage(0);
	};

	return (
		<div className="space-y-4">
			<p className="font-medium text-muted-foreground text-sm tabular-nums">
				{isCountLoading ? (
					<Skeleton as="span" className="inline-block h-4 w-16 rounded" />
				) : isAudiobook ? (
					m["media.audiobook_count"]({ count: total ?? 0 })
				) : (
					m["media.book_count"]({ count: total ?? 0 })
				)}
			</p>

			<div className="flex flex-wrap gap-2.5">
				{FORMAT_FILTERS.map((filter) => (
					<Button
						key={filter.format}
						variant={format === filter.format ? "default" : "outline"}
						size="sm"
						onClick={() => handleFormatChange(filter.format)}
					>
						{filter.format === "books"
							? m["nav.books"]()
							: m["nav.audiobooks"]()}
					</Button>
				))}
			</div>

			{isError || isCountError ? (
				<QueryErrorState
					onRetry={() => void Promise.all([refetch(), refetchCount()])}
				/>
			) : isLoading ? (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((id) => (
						<BookCardSkeleton key={id} square={isAudiobook} />
					))}
				</div>
			) : books.length === 0 ? (
				<EmptyState
					title={
						isAudiobook
							? m["likes.empty_title_audiobooks"]()
							: m["likes.empty_title"]()
					}
					description={
						isAudiobook
							? m["likes.empty_desc_audiobooks"]()
							: m["likes.empty_desc"]()
					}
				/>
			) : (
				<div className={BOOK_GRID_CLASS}>
					{books.map((book) => (
						<BookCard
							key={book.bookId}
							uuid={book.bookUuid}
							title={book.title}
							filename={book.bookFilename}
							cover={book.cover}
							tint={book.mainColor}
							authors={book.authors}
							coverPreset={coverPresets.small}
							mediaType={isAudiobook ? "audiobook" : "ebook"}
							coverFrameRatio={isAudiobook ? "square" : "book"}
						/>
					))}
				</div>
			)}

			<ProfilePagination
				page={page}
				totalPages={totalPages}
				onPageChange={setPage}
			/>
		</div>
	);
}
