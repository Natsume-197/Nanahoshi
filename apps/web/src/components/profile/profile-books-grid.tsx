import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { retainCatalogData } from "@/components/catalog/catalog-queries";
import { QueryErrorState } from "@/components/libraries/query-error-state";
import { ProfilePagination } from "@/components/profile/profile-pagination";
import { CategorySelector } from "@/components/shared/category-selector";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiSnapshotState } from "@/hooks/use-ui-snapshot-state";
import { m } from "@/paraglide/messages";
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

	const queryClient = useQueryClient();
	const { data, isLoading, isError, isPlaceholderData, refetch } = useQuery({
		...orpc.bookShelf.getPublicShelfPaginated.queryOptions({
			input: {
				username,
				status: activeStatus,
				limit: PAGE_SIZE,
				offset: page * PAGE_SIZE,
			},
		}),
		staleTime: 60_000,
		meta: { catalogScope: username },
		// Keep cards mounted during filter/page requests, only within this profile.
		placeholderData: (data, previousQuery) =>
			retainCatalogData(
				data,
				previousQuery,
				username,
				queryClient.getQueryCache(),
			),
	});

	const total = data?.total ?? 0;
	const items = data?.items ?? [];
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const handleStatusChange = (status: ShelfStatus | undefined) => {
		onStatusChange(status);
		setPage(0);
	};
	const statusLabel = (status: ShelfStatus | undefined) =>
		status === undefined
			? m["catalog_pages.all"]()
			: status === "reading"
				? m["catalog_pages.reading"]()
				: status === "completed"
					? m["catalog_pages.completed"]()
					: status === "backlog"
						? m["catalog_pages.backlog"]()
						: m["catalog_pages.want_read"]();

	return (
		<div className="space-y-4" aria-busy={isPlaceholderData}>
			{/* Header with count */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="font-medium text-muted-foreground text-sm tabular-nums">
					{isLoading ? (
						<Skeleton as="span" className="inline-block h-4 w-16 rounded" />
					) : (
						m["media.book_count"]({ count: total })
					)}
				</p>
			</div>

			{/* Status filter pills */}
			<CategorySelector<ShelfStatus | "all">
				value={activeStatus ?? "all"}
				items={STATUS_FILTERS.map((filter) => ({
					value: filter.status ?? "all",
					label: () => statusLabel(filter.status),
				}))}
				onValueChange={(status) =>
					handleStatusChange(status === "all" ? undefined : status)
				}
				ariaLabel={m["search.filter_results"]()}
				className="p-0 md:p-0 lg:p-0"
			/>

			{/* Book grid */}
			{isError ? (
				<QueryErrorState onRetry={() => void refetch()} />
			) : isLoading ? (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((id) => (
						<BookCardSkeleton key={id} />
					))}
				</div>
			) : items.length === 0 ? (
				<EmptyState
					title={m["library_page.empty_title"]()}
					description={
						activeStatus
							? m["catalog_pages.no_status_books"]()
							: m["catalog_pages.empty_shelf"]()
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
			<fieldset disabled={isPlaceholderData} className="min-w-0">
				<ProfilePagination
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			</fieldset>
		</div>
	);
}
