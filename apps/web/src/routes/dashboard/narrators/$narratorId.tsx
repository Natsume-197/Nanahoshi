import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { VirtualizedCardGrid } from "@/components/shared/virtualized-card-grid";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/narrators/$narratorId")({
	component: NarratorAudiobooksPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
});

const PAGE_SIZE = 30;

function NarratorAudiobooksPage() {
	const { narratorId } = Route.useParams();
	const parsedNarratorId = Number.parseInt(narratorId, 10);
	const shouldSearch = Number.isFinite(parsedNarratorId);

	const {
		data: audiobooksData,
		isLoading,
		hasNextPage,
		fetchNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["audiobooks", "narrator", parsedNarratorId],
		queryFn: async ({ pageParam }) => {
			return client.audiobooks.search({
				filters: { narratorIds: [parsedNarratorId] },
				cursor: pageParam ?? undefined,
				limit: PAGE_SIZE,
			});
		},
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const audiobooks = useMemo(
		() => audiobooksData?.pages.flatMap((page) => page.audiobooks) ?? [],
		[audiobooksData],
	);

	const totalHits = audiobooksData?.pages[0]?.pagination.totalHits ?? 0;

	const resolvedNarratorName = useMemo(() => {
		if (!shouldSearch) return null;
		for (const audiobook of audiobooks) {
			const match = audiobook.narrators?.find((n) => n.id === parsedNarratorId);
			if (match?.name) return match.name;
		}
		return null;
	}, [audiobooks, parsedNarratorId, shouldSearch]);

	const displayNarrator =
		resolvedNarratorName ?? (shouldSearch ? `Narrator #${narratorId}` : null);

	const hasNoResults = shouldSearch && !isLoading && audiobooks.length === 0;

	return (
		<div className="space-y-6 p-6 lg:p-8">
			{displayNarrator && (
				<div className="flex flex-wrap items-baseline gap-2">
					<h1 className="font-semibold text-xl">
						Narrated by &ldquo;{displayNarrator}&rdquo;
					</h1>
					{totalHits > 0 && (
						<span className="text-muted-foreground text-sm">
							{totalHits.toLocaleString()} found
						</span>
					)}
				</div>
			)}

			{!displayNarrator && (
				<p className="text-muted-foreground text-sm">Invalid narrator id.</p>
			)}

			{isLoading && shouldSearch && (
				<div className="flex items-center gap-2 text-muted-foreground text-sm">
					<Loader2 className="size-4 animate-spin" />
					Loading...
				</div>
			)}

			{audiobooks.length > 0 && (
				<BookContextMenuRoot mediaType="audiobook">
					<VirtualizedCardGrid
						items={audiobooks}
						getKey={(audiobook) => audiobook.uuid}
						gap={8}
						estimateRowHeight={330}
						hasNextPage={hasNextPage}
						isFetchingNextPage={isFetchingNextPage}
						fetchNextPage={fetchNextPage}
						renderItem={(audiobook) => (
							<BookContextMenuTrigger bookUuid={audiobook.uuid}>
								<BookCard
									uuid={audiobook.uuid}
									title={audiobook.title ?? null}
									filename={audiobook.filename}
									cover={audiobook.cover ?? null}
									authors={audiobook.authors ?? undefined}
									mediaType="audiobook"
									contextMenuEnabled={false}
								/>
							</BookContextMenuTrigger>
						)}
					/>
				</BookContextMenuRoot>
			)}

			{hasNoResults && (
				<EmptyState
					title="No audiobooks yet"
					description="Try scanning your libraries or check the narrator name."
				/>
			)}
		</div>
	);
}
