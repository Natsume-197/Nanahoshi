import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets } from "@/utils/covers";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";

export type RecentlyAddedAudiobook = {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	authors?: { id?: number | null; name: string }[];
};

type RecentlyAddedAudiobooksSectionProps = {
	audiobooks: RecentlyAddedAudiobook[];
};

export const RecentlyAddedAudiobooksSection = memo(
	function RecentlyAddedAudiobooksSection({
		audiobooks,
	}: RecentlyAddedAudiobooksSectionProps): JSX.Element | null {
		if (audiobooks.length === 0) {
			return null;
		}

		return (
			<ScrollSection title="Recently added audiobooks">
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
