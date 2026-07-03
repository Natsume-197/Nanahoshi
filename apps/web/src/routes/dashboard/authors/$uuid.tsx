import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EditEntityDialog } from "@/components/catalog/edit-entity-dialog";
import { CollectionSearch } from "@/components/shared/collection-search";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionToolbar } from "@/components/shared/collection-toolbar";
import { EmptyState } from "@/components/shared/empty-state";
import { type SortOption, SortSelect } from "@/components/shared/sort-select";
import { type ViewMode, ViewToggle } from "@/components/shared/view-toggle";
import {
	type RowHeightEstimate,
	VirtualizedCardGrid,
} from "@/components/shared/virtualized-card-grid";
import { Button } from "@/components/ui/button";
import { useAbilities } from "@/hooks/use-abilities";
import { useCollectionView } from "@/hooks/use-collection-view";
import { getCoverFilename } from "@/utils/covers";
import { formatAvgRating, getErrorMessage } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

const PAGE_SIZE = 30;
const BOOK_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator();
const AUDIOBOOK_CARD_ROW_ESTIMATE = createBookCardShellRowHeightEstimator({
	square: true,
});

// A book or audiobook search hit — the shared subset both sections render.
type WorkItem = {
	uuid: string;
	title?: string | null;
	filename: string;
	cover?: string | null;
	mainColor?: string | null;
	authors?: { id?: number | null; name: string }[] | null;
};

// One author section (Books or Audiobooks): grid of cards or a table list,
// sharing the same wiring so the two sections never drift apart.
function WorksSection<T extends WorkItem>({
	heading,
	view,
	items,
	to,
	mediaType,
	gridRowEstimate,
	hasNextPage,
	isFetchingNextPage,
	fetchNextPage,
}: {
	heading: ReactNode;
	view: ViewMode;
	items: T[];
	to: "/dashboard/books/$uuid" | "/dashboard/audiobooks/$uuid";
	mediaType: "ebook" | "audiobook";
	gridRowEstimate: RowHeightEstimate;
	hasNextPage?: boolean;
	isFetchingNextPage?: boolean;
	fetchNextPage: () => void;
}) {
	return (
		<section className="space-y-3">
			{heading ? <h2 className="font-semibold text-lg">{heading}</h2> : null}
			<BookContextMenuRoot mediaType={mediaType}>
				{view === "list" ? (
					<div className="overflow-hidden rounded-xl border border-border/60">
						<CollectionTableHeader />
						<VirtualizedCardGrid
							items={items}
							getKey={(item) => item.uuid}
							gap={0}
							columns={1}
							estimateRowHeight={56}
							hasNextPage={hasNextPage}
							isFetchingNextPage={isFetchingNextPage}
							fetchNextPage={fetchNextPage}
							renderItem={(item, index) => (
								<BookContextMenuTrigger bookUuid={item.uuid}>
									<CollectionTableRow
										withMeta={false}
										index={index + 1}
										linkProps={{ to, params: { uuid: item.uuid } }}
										coverFilename={getCoverFilename(item.cover)}
										title={item.title ?? item.filename}
										authors={item.authors}
									/>
								</BookContextMenuTrigger>
							)}
						/>
					</div>
				) : (
					<VirtualizedCardGrid
						items={items}
						getKey={(item) => item.uuid}
						gap={8}
						estimateRowHeight={gridRowEstimate}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						renderItem={(item) => (
							<BookContextMenuTrigger bookUuid={item.uuid}>
								<BookCard
									uuid={item.uuid}
									title={item.title ?? null}
									filename={item.filename}
									cover={item.cover ?? null}
									authors={item.authors ?? undefined}
									mediaType={mediaType}
									contextMenuEnabled={false}
								/>
							</BookContextMenuTrigger>
						)}
					/>
				)}
			</BookContextMenuRoot>
		</section>
	);
}

type SortMode = "newest" | "oldest" | "title_asc";

const SORT_OPTIONS: readonly SortOption<SortMode>[] = [
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "title_asc", label: "Title" },
];

export const Route = createFileRoute("/dashboard/authors/$uuid")({
	component: AuthorBooksPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
});

function AuthorBooksPage() {
	const { uuid } = Route.useParams();
	const { data: entity, isLoading: isAuthorLoading } = useQuery({
		...orpc.authors.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 60_000,
	});
	const shouldSearch = entity != null;

	const {
		view,
		setView,
		sort,
		setSort,
		search,
		setSearch,
		query,
		isSearching,
	} = useCollectionView<SortMode>({
		storageKey: "nh-author-view",
		defaultSort: "newest",
	});

	const booksQuery = useInfiniteQuery({
		queryKey: ["books", "author", uuid, sort, query],
		queryFn: async ({ pageParam }) =>
			client.books.search({
				filters: { authorUuids: [uuid] },
				query: query || undefined,
				sort,
				cursor: pageParam ?? undefined,
				limit: PAGE_SIZE,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const audiobooksQuery = useInfiniteQuery({
		queryKey: ["audiobooks", "author", uuid, sort, query],
		queryFn: async ({ pageParam }) =>
			client.audiobooks.search({
				filters: { authorUuids: [uuid] },
				query: query || undefined,
				sort,
				cursor: pageParam ?? undefined,
				limit: PAGE_SIZE,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const books = useMemo(
		() => booksQuery.data?.pages.flatMap((page) => page.books) ?? [],
		[booksQuery.data],
	);
	const audiobooks = useMemo(
		() => audiobooksQuery.data?.pages.flatMap((page) => page.audiobooks) ?? [],
		[audiobooksQuery.data],
	);

	const total =
		(booksQuery.data?.pages[0]?.pagination.totalHits ?? 0) +
		(audiobooksQuery.data?.pages[0]?.pagination.totalHits ?? 0);

	const { data: ratingStats } = useQuery({
		...orpc.authors.ratingStats.queryOptions({
			input: { uuid },
		}),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const resolvedAuthorName = entity?.name ?? null;

	const { can } = useAbilities();
	const [editOpen, setEditOpen] = useState(false);
	const canEdit = can("book", "editMetadata") && shouldSearch;

	const renameMutation = useMutation({
		...orpc.authors.update.mutationOptions(),
		onSuccess: () => {
			setEditOpen(false);
			toast.success("Author updated");
			queryClient.invalidateQueries();
		},
		onError: (err) =>
			toast.error(getErrorMessage(err, "Failed to update author")),
	});

	const isLoading =
		isAuthorLoading || booksQuery.isLoading || audiobooksQuery.isLoading;
	const isFetching = booksQuery.isFetching || audiobooksQuery.isFetching;
	const hasItems = books.length > 0 || audiobooks.length > 0;
	const showHeadings = books.length > 0 && audiobooks.length > 0;
	const showControls = !isLoading && (hasItems || isSearching);

	if (!isAuthorLoading && !shouldSearch) {
		return (
			<div className="p-6 lg:p-8">
				<EmptyState title="Invalid author" description="Unknown author." />
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<CollectionToolbar
				title={
					resolvedAuthorName ? `Works by “${resolvedAuthorName}”` : "Author"
				}
				loading={isFetching && !isLoading}
				subtitle={
					!isLoading && !isSearching
						? [
								total
									? `${total.toLocaleString()} ${total === 1 ? "work" : "works"}`
									: null,
								formatAvgRating(ratingStats?.average),
							]
								.filter(Boolean)
								.join("  ·  ") || undefined
						: undefined
				}
				actions={
					canEdit || showControls ? (
						<>
							{canEdit && resolvedAuthorName && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setEditOpen(true)}
								>
									<Pencil className="mr-1.5 size-4" />
									Edit
								</Button>
							)}
							{showControls && (
								<>
									<CollectionSearch
										value={search}
										onChange={setSearch}
										placeholder="Search works…"
										ariaLabel="Search works by this author"
									/>
									{hasItems && <ViewToggle view={view} onChange={setView} />}
									{hasItems && (
										<SortSelect
											value={sort}
											onChange={setSort}
											options={SORT_OPTIONS}
											ariaLabel="Sort works"
										/>
									)}
								</>
							)}
						</>
					) : undefined
				}
			/>

			{canEdit && resolvedAuthorName && (
				<EditEntityDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					title="Edit author"
					initialName={resolvedAuthorName}
					isPending={renameMutation.isPending}
					onSubmit={(values) =>
						renameMutation.mutate({ uuid, name: values.name })
					}
				/>
			)}

			{!isLoading && !hasItems && (
				<EmptyState
					title={isSearching ? "No matches" : "No works yet"}
					description={
						isSearching
							? `No works by this author match “${query}”.`
							: "Try scanning your libraries or check the author spelling."
					}
				/>
			)}

			{books.length > 0 && (
				<WorksSection
					heading={showHeadings ? "Books" : null}
					view={view}
					items={books}
					to="/dashboard/books/$uuid"
					mediaType="ebook"
					gridRowEstimate={BOOK_CARD_ROW_ESTIMATE}
					hasNextPage={booksQuery.hasNextPage}
					isFetchingNextPage={booksQuery.isFetchingNextPage}
					fetchNextPage={booksQuery.fetchNextPage}
				/>
			)}

			{audiobooks.length > 0 && (
				<WorksSection
					heading={showHeadings ? "Audiobooks" : null}
					view={view}
					items={audiobooks}
					to="/dashboard/audiobooks/$uuid"
					mediaType="audiobook"
					gridRowEstimate={AUDIOBOOK_CARD_ROW_ESTIMATE}
					hasNextPage={audiobooksQuery.hasNextPage}
					isFetchingNextPage={audiobooksQuery.isFetchingNextPage}
					fetchNextPage={audiobooksQuery.fetchNextPage}
				/>
			)}
		</div>
	);
}
