import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BookCard } from "@/components/books/book-card";
import { BookCardSkeleton } from "@/components/books/book-card-skeleton";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { orpc } from "@/utils/orpc";

const SKELETON_KEYS = Array.from({ length: 6 }, (_, i) => `skeleton-${i}`);

export const Route = createFileRoute(
	"/dashboard/audiobooks/series/$seriesName",
)({
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
				input: { seriesName: params.seriesName },
			}),
		);
	},
});

function AudiobookSeriesDetailPage() {
	const { seriesName } = Route.useParams();
	const decodedName = decodeURIComponent(seriesName);

	const { data: audiobooks, isLoading } = useQuery({
		...orpc.audiobooks.listBySeries.queryOptions({
			input: { seriesName: decodedName },
		}),
		staleTime: 30_000,
	});

	return (
		<div className="space-y-6 p-6 lg:p-8">
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">{decodedName}</h1>
				{audiobooks && (
					<p className="text-muted-foreground text-sm">
						{audiobooks.length}{" "}
						{audiobooks.length === 1 ? "audiobook" : "audiobooks"} in this
						series
					</p>
				)}
			</div>

			{isLoading && (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
					{SKELETON_KEYS.map((key) => (
						<BookCardSkeleton key={key} />
					))}
				</div>
			)}

			{!isLoading && audiobooks && audiobooks.length > 0 && (
				<BookContextMenuRoot mediaType="audiobook">
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{audiobooks.map((ab) => (
							<BookContextMenuTrigger key={ab.uuid} bookUuid={ab.uuid}>
								<BookCard
									uuid={ab.uuid}
									title={ab.title}
									filename={ab.filename}
									cover={ab.cover}
									contextMenuEnabled={false}
									mediaType="audiobook"
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
					variant="primary"
				/>
			)}
		</div>
	);
}
