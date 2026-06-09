import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Headphones, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { SeriesContextMenu } from "@/components/series/series-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

export const Route = createFileRoute("/dashboard/audiobooks/series/")({
	component: AudiobookSeriesPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function AudiobookSeriesPage() {
	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery(
			orpc.audiobooks.listSeries.infiniteOptions({
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
				<h1 className="font-bold text-2xl tracking-tight">Audiobook Series</h1>
				<p className="text-muted-foreground text-sm">
					Browse audiobook series in your library.
				</p>
			</div>

			{isLoading && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading series...
				</div>
			)}

			{!isLoading && seriesList.length === 0 && (
				<EmptyState
					title="No audiobook series found"
					description="Series will appear here once your audiobooks are enriched with metadata."
					variant="primary"
				/>
			)}

			{seriesList.length > 0 && (
				<VirtualizedCardGrid
					items={seriesList}
					getKey={(s) => s.id}
					gap={16}
					estimateRowHeight={300}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					fetchNextPage={fetchNextPage}
					renderItem={(s) => (
						<SeriesContextMenu
							href={`/dashboard/audiobooks/series/${encodeURIComponent(s.name)}`}
						>
							<Link
								to="/dashboard/audiobooks/series/$seriesName"
								params={{ seriesName: s.name }}
								className="group block"
							>
								<div className="overflow-hidden rounded-lg">
									{s.cover ? (
										<img
											src={getCoverPresetUrl(
												getCoverFilename(s.cover) ?? "",
												coverPresets.card,
											)}
											alt={s.name}
											className="aspect-square w-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-[1.02]"
											loading="lazy"
										/>
									) : (
										<div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted/70">
											<Headphones className="size-8 text-muted-foreground/40" />
										</div>
									)}
								</div>
								<div className="pt-2">
									<p className="line-clamp-2 font-medium text-sm leading-tight">
										{s.name}
									</p>
									<p className="text-muted-foreground text-xs">
										{s.audiobookCount}{" "}
										{s.audiobookCount === 1 ? "audiobook" : "audiobooks"}
									</p>
								</div>
							</Link>
						</SeriesContextMenu>
					)}
				/>
			)}
		</div>
	);
}
