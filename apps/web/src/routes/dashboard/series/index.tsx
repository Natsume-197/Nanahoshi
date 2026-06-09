import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { useMemo } from "react";
import { BookCardShell } from "@/components/books/book-card-shell";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { coverPresets, getCoverFilename } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;
/** Minimum tile width; matches the grid below so the skeleton lays out the same. */
const TILE_MIN_WIDTH = 180;
const SKELETON_KEYS = Array.from(
	{ length: 12 },
	(_, i) => `series-skeleton-${i}`,
);

export const Route = createFileRoute("/dashboard/series/")({
	component: SeriesPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function SeriesPage() {
	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery(
			orpc.series.list.infiniteOptions({
				input: (pageParam?: number) => ({
					limit: PAGE_SIZE,
					cursor: pageParam,
				}),
				getNextPageParam: (lastPage, _allPages, lastPageParam) =>
					lastPage.length === PAGE_SIZE
						? (lastPageParam ?? 0) + PAGE_SIZE
						: undefined,
				initialPageParam: undefined,
				staleTime: 30_000,
			}),
		);

	const seriesList = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">Book Series</h1>
				<p className="text-muted-foreground text-sm">
					Browse book series in your library.
				</p>
			</div>

			{isLoading && (
				<div
					className="grid gap-4"
					style={{
						gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_WIDTH}px, 1fr))`,
					}}
				>
					{SKELETON_KEYS.map((key) => (
						<BookCardSkeleton key={key} />
					))}
				</div>
			)}

			{!isLoading && seriesList.length === 0 && (
				<EmptyState
					title="No series found"
					description="Series will appear here once your books are enriched with metadata."
					variant="primary"
				/>
			)}

			{seriesList.length > 0 && (
				<VirtualizedCardGrid
					items={seriesList}
					getKey={(s) => s.id}
					gap={16}
					minTileWidth={TILE_MIN_WIDTH}
					estimateRowHeight={400}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					fetchNextPage={fetchNextPage}
					renderItem={(s) => (
						<SeriesContextMenu
							href={`/dashboard/series/${encodeURIComponent(s.name)}`}
						>
							<div>
								<BookCardShell
									linkProps={{
										to: "/dashboard/series/$seriesName",
										params: { seriesName: s.name },
										preload: "intent",
									}}
									ariaLabel={s.name}
									coverFilename={getCoverFilename(s.cover) ?? undefined}
									coverPreset={coverPresets.small}
									stacked
									fallback={
										<div className="flex h-full w-full items-center justify-center">
											<Library className="size-8 text-muted-foreground/40" />
										</div>
									}
									title={s.name}
									subtitle={`${s.bookCount} ${s.bookCount === 1 ? "book" : "books"}`}
								/>
							</div>
						</SeriesContextMenu>
					)}
				/>
			)}
		</div>
	);
}
