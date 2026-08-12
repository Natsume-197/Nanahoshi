import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { client, orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { RandomRefreshButton } from "./random-refresh-button";
import { DASHBOARD_LIMIT, SectionSkeleton } from "./section-skeleton";

export const RandomAudiobooksSection = memo(
	function RandomAudiobooksSection(): JSX.Element | null {
		const queryClient = useQueryClient();
		const randomAudiobooks = orpc.audiobooks.listRandom.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		});
		const { data: audiobooks, isLoading } = useQuery({
			...randomAudiobooks,
			// Pin the shuffle for the session so the rail never re-randomizes on
			// refocus/reconnect/remount — only the refresh button reshuffles.
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

		if (isLoading) return <SectionSkeleton square />;
		if (!audiobooks || audiobooks.length === 0) return null;

		const title = m["home.random_audiobooks"]();

		return (
			<ScrollSection
				title={title}
				restoreId="random-audiobooks"
				headerAction={
					<RandomRefreshButton
						disabled={isRefreshing}
						onRefresh={handleRefresh}
						sectionTitle={title}
					/>
				}
			>
				{audiobooks.map((audiobook, index) => (
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
							tint={audiobook.mainColor}
							authors={audiobook.authors}
							contextMenuEnabled={false}
							priority={index === 0}
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
