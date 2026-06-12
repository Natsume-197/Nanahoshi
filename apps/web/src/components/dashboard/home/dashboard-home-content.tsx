import { type JSX, memo } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueListeningSection } from "./continue-listening-section";
import { ContinueReadingSection } from "./continue-reading-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedAudiobooksSection } from "./recently-added-audiobooks-section";
import { RecentlyAddedSection } from "./recently-added-section";

export const DashboardHomeContent = memo(
	function DashboardHomeContent(): JSX.Element {
		const online = useOnlineStatus();

		return (
			<BookContextMenuRoot>
				<div className="relative space-y-4 px-3 py-6 md:px-6 md:py-6 lg:px-8 lg:py-8">
					<ContinueReadingSection />
					{online && (
						<>
							<ContinueListeningSection />
							<RecentlyAddedSection />
							<BookSeriesSection />
							<RecentlyAddedAudiobooksSection />
							<AudiobookSeriesSection />
							<RandomBooksSection />
						</>
					)}
				</div>
			</BookContextMenuRoot>
		);
	},
);
