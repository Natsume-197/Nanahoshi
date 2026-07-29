import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { client, orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT } from "./section-skeleton";

export const RandomAudiobooksSection = memo(
	function RandomAudiobooksSection(): JSX.Element | null {
		const queryClient = useQueryClient();
		const randomAudiobooks = orpc.audiobooks.listRandom.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		});
		const { data: audiobooks, isLoading } = useQuery({
			...randomAudiobooks,
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: Number.POSITIVE_INFINITY,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

		const [isRefreshing, setIsRefreshing] = useState(false);

		const handleRefresh = useCallback((): void => {
			if (isRefreshing) return;

			setIsRefreshing(true);
			client.audiobooks
				.listRandom({ limit: DASHBOARD_LIMIT })
				.then((next) => {
					// Write into the query cache (not local state) so the refreshed
					// shuffle survives the section unmounting/remounting on navigation.
					queryClient.setQueryData(randomAudiobooks.queryKey, next);
				})
				.catch((error: unknown) => {
					toast.error(
						error instanceof Error
							? error.message
							: m["toast.refresh_recommendations_failed"](),
					);
				})
				.finally(() => {
					setIsRefreshing(false);
				});
		}, [isRefreshing, queryClient, randomAudiobooks.queryKey]);

		if (isLoading) return null;
		if (!audiobooks || audiobooks.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.pick_something_random"]()}
				restoreId="random-audiobooks"
				headerAction={
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isRefreshing}
						className="inline-flex items-center gap-1 font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
					>
						{m["home.refresh"]()}
					</button>
				}
			>
				{audiobooks.map((audiobook) => (
					<DashboardContextMenuBook
						key={audiobook.uuid}
						bookUuid={audiobook.uuid}
						mediaType="audiobook"
					>
						<BookCard
							uuid={audiobook.uuid}
							title={audiobook.title}
							filename={audiobook.filename}
							cover={audiobook.cover}
							authors={audiobook.authors}
							contextMenuEnabled={false}
							coverPreset={coverPresets.small}
							compactTextBlock
							mediaType="audiobook"
							coverFrameRatio="square"
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
