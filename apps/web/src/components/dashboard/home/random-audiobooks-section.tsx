import { useQuery } from "@tanstack/react-query";
import { type JSX, memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { client, orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT } from "./section-skeleton";

type RandomAudiobook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	authors?: { id?: number | null; name: string }[];
};

export const RandomAudiobooksSection = memo(
	function RandomAudiobooksSection(): JSX.Element | null {
		const { data: initialAudiobooks, isLoading } = useQuery({
			...orpc.audiobooks.listRandom.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: Number.POSITIVE_INFINITY,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		});

		const [refreshed, setRefreshed] = useState<RandomAudiobook[] | null>(null);
		const [isRefreshing, setIsRefreshing] = useState(false);

		const audiobooks = refreshed ?? initialAudiobooks;

		const handleRefresh = useCallback((): void => {
			if (isRefreshing) return;

			setIsRefreshing(true);
			client.audiobooks
				.listRandom({ limit: DASHBOARD_LIMIT })
				.then((next) => {
					setRefreshed((next ?? []) as RandomAudiobook[]);
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
		}, [isRefreshing]);

		if (isLoading) return null;
		if (!audiobooks || audiobooks.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.you_might_like"]()}
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
							mediaType="audiobook"
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
