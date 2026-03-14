import { type JSX, memo } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets } from "@/utils/covers";
import { DashboardContextMenuBook } from "./dashboard-context-menu-book";

export type ContinueReadingEntry = {
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor?: string | null;
	exploredCharCount: number | null;
	bookCharCount: number | null;
	authors?: { id?: number | null; name: string }[];
};

type ContinueReadingSectionProps = {
	entries: ContinueReadingEntry[];
};

function getProgress(entry: ContinueReadingEntry): number {
	if (!entry.bookCharCount || entry.bookCharCount <= 0) return 0;
	return Math.min(
		Math.round(((entry.exploredCharCount ?? 0) / entry.bookCharCount) * 100),
		100,
	);
}

export const ContinueReadingSection = memo(function ContinueReadingSection({
	entries,
}: ContinueReadingSectionProps): JSX.Element | null {
	if (entries.length === 0) {
		return null;
	}

	return (
		<ScrollSection title="Continue reading">
			{entries.map((entry, index) => (
				<DashboardContextMenuBook
					key={entry.bookUuid}
					bookUuid={entry.bookUuid}
				>
					<BookCard
						uuid={entry.bookUuid}
						title={entry.title}
						filename={entry.bookFilename}
						cover={entry.cover}
						authors={entry.authors}
						contextMenuEnabled={false}
						priority={index === 0}
						coverPreset={coverPresets.small}
						progress={getProgress(entry)}
					/>
				</DashboardContextMenuBook>
			))}
		</ScrollSection>
	);
});
