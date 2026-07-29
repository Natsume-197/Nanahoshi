import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { createBookCardShellRowHeightEstimator } from "@/components/books/book-card-shell";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { resumeMeta } from "@/components/dashboard/home/resume-meta";
import {
	CollectionTableHeader,
	CollectionTableRow,
} from "@/components/shared/collection-table-row";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import type { SortOption } from "@/components/shared/sort-select";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
import { useCollectionView } from "@/hooks/use-collection-view";
import { m } from "@/paraglide/messages";
import { getCoverFilename } from "@/utils/covers";
import { formatNames, progressPercent } from "@/utils/format";
import { orpc } from "@/utils/orpc";

// The progress endpoints cap at 50 rows each and have no cursor. That is the
// whole of "what you're in the middle of" for any real user, so this page
// sorts and filters the two lists in the client instead of asking the server
// for paging it cannot do.
const PROGRESS_LIMIT = 50;
const ROW_ESTIMATE = createBookCardShellRowHeightEstimator();

type SortMode = "recent" | "title" | "progress";

type InProgressItem = {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	authors: { uuid?: string | null; name: string }[];
	mediaType: "ebook" | "audiobook";
	progress: number;
	lastActivityAt: string | null;
};

export const Route = createFileRoute("/dashboard/recent")({
	component: ReadingPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function ReadingPage() {
	const readingQuery = useQuery(continueReadingQueryOptions());
	const listeningQuery = useQuery(
		orpc.listeningProgress.listInProgress.queryOptions({
			input: { limit: PROGRESS_LIMIT },
		}),
	);

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
		storageKey: "nh-recent-view",
		defaultSort: "recent",
	});

	const items = useMemo<InProgressItem[]>(() => {
		const merged: InProgressItem[] = [
			...(readingQuery.data ?? []).map((entry) => ({
				uuid: entry.bookUuid,
				title: entry.title,
				filename: entry.bookFilename,
				cover: entry.cover,
				authors: entry.authors,
				mediaType: "ebook" as const,
				progress: progressPercent(entry.exploredCharCount, entry.bookCharCount),
				lastActivityAt: entry.lastReadAt,
			})),
			...(listeningQuery.data ?? []).map((entry) => ({
				uuid: entry.bookUuid,
				title: entry.title,
				filename: entry.bookFilename,
				cover: entry.cover,
				authors: entry.authors,
				mediaType: "audiobook" as const,
				progress: progressPercent(
					entry.currentTimeSeconds ?? 0,
					entry.durationSeconds != null && entry.durationSeconds > 0
						? entry.durationSeconds
						: entry.duration,
				),
				lastActivityAt: entry.lastListenedAt,
			})),
		];

		const needle = query.trim().toLowerCase();
		const filtered = needle
			? merged.filter((item) =>
					`${item.title ?? item.filename} ${formatNames(item.authors)}`
						.toLowerCase()
						.includes(needle),
				)
			: merged;

		return filtered.sort((a, b) => {
			if (sort === "title") {
				return (a.title ?? a.filename).localeCompare(b.title ?? b.filename);
			}
			if (sort === "progress") return b.progress - a.progress;
			return (
				new Date(b.lastActivityAt ?? 0).getTime() -
				new Date(a.lastActivityAt ?? 0).getTime()
			);
		});
	}, [readingQuery.data, listeningQuery.data, query, sort]);

	const sortOptions: readonly SortOption<SortMode>[] = [
		{ value: "recent", label: m["recent.sort_last_activity"]() },
		{ value: "title", label: m["common.title"]() },
		{ value: "progress", label: m["recent.sort_progress"]() },
	];

	return (
		<BookContextMenuRoot>
			<CollectionView
				title={m["home.recent"]()}
				subtitle={
					items.length > 0
						? m["media.book_count"]({ count: items.length })
						: undefined
				}
				isLoading={readingQuery.isLoading || listeningQuery.isLoading}
				isFetching={readingQuery.isFetching || listeningQuery.isFetching}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder={m["recent.search_placeholder"]()}
				searchAriaLabel={m["recent.search_aria"]()}
				isSearching={isSearching}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={sortOptions}
				sortAriaLabel={m["recent.sort_aria"]()}
				view={view}
				onViewChange={setView}
				items={items}
				getKey={(item) => `${item.mediaType}-${item.uuid}`}
				gridRowEstimate={ROW_ESTIMATE}
				renderGridItem={(item) => (
					<BookContextMenuTrigger
						bookUuid={item.uuid}
						mediaType={item.mediaType}
					>
						<BookCard
							uuid={item.uuid}
							title={item.title}
							filename={item.filename}
							cover={item.cover}
							authors={item.authors}
							mediaType={item.mediaType}
							progress={item.progress}
							contextMenuEnabled={false}
						/>
					</BookContextMenuTrigger>
				)}
				listHeader={
					<CollectionTableHeader metaLabel={m["recent.list_meta"]()} />
				}
				renderListItem={(item, index) => (
					<BookContextMenuTrigger
						bookUuid={item.uuid}
						mediaType={item.mediaType}
					>
						<CollectionTableRow
							index={index + 1}
							linkProps={
								item.mediaType === "audiobook"
									? {
											to: "/dashboard/audiobooks/$uuid",
											params: { uuid: item.uuid },
										}
									: {
											to: "/dashboard/books/$uuid",
											params: { uuid: item.uuid },
										}
							}
							coverFilename={getCoverFilename(item.cover)}
							title={item.title ?? item.filename}
							authors={item.authors}
							meta={resumeMeta(item.progress)}
						/>
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title={m["recent.empty_title"]()}
						description={m["recent.empty_desc"]()}
					/>
				}
				searchEmptyState={
					<EmptyState
						title={m["settings.no_matches"]()}
						description={m["recent.no_matches"]({ query })}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
