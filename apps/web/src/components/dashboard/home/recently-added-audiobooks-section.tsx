import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";
import { DASHBOARD_LIMIT } from "./section-skeleton";

export const RecentlyAddedAudiobooksSection = memo(
	function RecentlyAddedAudiobooksSection(): JSX.Element | null {
		const { data: audiobooks, isLoading } = useQuery(
			orpc.audiobooks.listRecent.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);

		if (isLoading) return null;
		if (!audiobooks || audiobooks.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.recently_added_audiobooks"]()}
				showAllHref="/dashboard/audiobooks"
				restoreId="recent-audiobooks"
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
						/>
					</DashboardContextMenuBook>
				))}
			</ScrollSection>
		);
	},
);
