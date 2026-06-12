import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Loader2, Mic } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 30;

export const Route = createFileRoute("/dashboard/narrators/")({
	component: NarratorsPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function NarratorsPage() {
	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery(
			orpc.narrators.list.infiniteOptions({
				input: (pageParam: number) => ({
					limit: PAGE_SIZE,
					cursor: pageParam,
				}),
				getNextPageParam: (lastPage, _allPages, lastPageParam) =>
					lastPage.length === PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
				initialPageParam: 0,
				staleTime: 30_000,
			}),
		);

	const narratorsList = useMemo(() => data?.pages.flat() ?? [], [data]);

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">Narrators</h1>
				<p className="text-muted-foreground text-sm">
					Browse narrators in your audiobook library.
				</p>
			</div>

			{isLoading && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading narrators...
				</div>
			)}

			{!isLoading && narratorsList.length === 0 && (
				<EmptyState
					title="No narrators found"
					description="Narrators will appear here once your audiobooks are enriched with metadata."
				/>
			)}

			{narratorsList.length > 0 && (
				<VirtualizedCardGrid
					items={narratorsList}
					getKey={(narrator) => narrator.id}
					gap={16}
					estimateRowHeight={240}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					fetchNextPage={fetchNextPage}
					renderItem={(narrator) => (
						<Link
							to="/dashboard/narrators/$narratorId"
							params={{ narratorId: String(narrator.id) }}
							className="group block"
						>
							<div className="flex aspect-square items-center justify-center rounded-full bg-muted/70 transition-colors group-hover:bg-muted">
								<Mic className="size-8 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground/60" />
							</div>
							<div className="pt-2 text-center">
								<p className="line-clamp-2 font-medium text-sm leading-tight">
									{narrator.name}
								</p>
								<p className="text-muted-foreground text-xs">
									{narrator.audiobookCount}{" "}
									{narrator.audiobookCount === 1 ? "audiobook" : "audiobooks"}
								</p>
							</div>
						</Link>
					)}
				/>
			)}
		</div>
	);
}
