import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { PAGE_SHELL } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { BOOK_GRID_CLASS } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `skeleton-${i}`);

export const Route = createFileRoute("/dashboard/audiobooks/series/$uuid")({
	component: AudiobookSeriesDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context, params }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.audiobooks.listBySeries.queryOptions({
				input: { seriesUuid: params.uuid },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.series.getByUuid.queryOptions({
				input: { uuid: params.uuid },
			}),
		);
	},
});

function AudiobookSeriesDetailPage() {
	const { uuid } = Route.useParams();

	const { data: audiobooks, isLoading } = useQuery({
		...orpc.audiobooks.listBySeries.queryOptions({
			input: { seriesUuid: uuid },
		}),
		staleTime: 30_000,
	});
	const { data: entity } = useQuery({
		...orpc.series.getByUuid.queryOptions({ input: { uuid } }),
		staleTime: 30_000,
	});

	return (
		<div className={cn(PAGE_SHELL, "space-y-6")}>
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">
					{entity?.name ?? "Series"}
				</h1>
				{audiobooks && (
					<p className="text-muted-foreground text-sm">
						{audiobooks.length}{" "}
						{audiobooks.length === 1 ? "audiobook" : "audiobooks"} in this
						series
					</p>
				)}
			</div>

			{isLoading && (
				<div className={BOOK_GRID_CLASS}>
					{SKELETON_KEYS.map((key) => (
						<BookCardSkeleton key={key} square />
					))}
				</div>
			)}

			{!isLoading && audiobooks && audiobooks.length > 0 && (
				<BookContextMenuRoot mediaType="audiobook">
					<div className={BOOK_GRID_CLASS}>
						{audiobooks.map((ab) => (
							<BookContextMenuTrigger key={ab.uuid} bookUuid={ab.uuid}>
								<BookCard
									uuid={ab.uuid}
									title={ab.title}
									filename={ab.filename}
									cover={ab.cover}
									tint={ab.mainColor}
									contextMenuEnabled={false}
									mediaType="audiobook"
									coverFrameRatio="square"
								/>
							</BookContextMenuTrigger>
						))}
					</div>
				</BookContextMenuRoot>
			)}

			{!isLoading && (!audiobooks || audiobooks.length === 0) && (
				<EmptyState
					title="No audiobooks found"
					description="This series doesn't have any audiobooks yet."
				/>
			)}
		</div>
	);
}
