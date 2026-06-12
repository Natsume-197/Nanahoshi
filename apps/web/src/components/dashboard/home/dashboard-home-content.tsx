import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, CloudOff } from "lucide-react";
import { type JSX, memo } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { Button } from "@/components/ui/button";
import { useCachedBooks } from "@/hooks/use-cached-books";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueListeningSection } from "./continue-listening-section";
import { ContinueReadingSection } from "./continue-reading-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedAudiobooksSection } from "./recently-added-audiobooks-section";
import { RecentlyAddedSection } from "./recently-added-section";

function OfflineHomeNotice() {
	const { data: books } = useCachedBooks();
	const count = books?.length ?? 0;

	return (
		<div className="flex flex-col items-center gap-3 py-24 text-center">
			<CloudOff
				className="size-12 text-muted-foreground/40"
				strokeWidth={1.5}
			/>
			<p className="font-medium text-lg">You're offline</p>
			<p className="max-w-sm text-muted-foreground text-sm">
				{count > 0
					? `No connection right now, but ${
							count === 1
								? "a downloaded book is"
								: `${count} downloaded books are`
						} ready to read offline.`
					: "No connection right now. Books you store offline can be read here without one."}
			</p>
			{count > 0 && (
				<Button asChild className="mt-2">
					<Link to="/dashboard/downloads">
						<ArrowDownToLine className="size-4" />
						View downloads
					</Link>
				</Button>
			)}
		</div>
	);
}

export const DashboardHomeContent = memo(
	function DashboardHomeContent(): JSX.Element {
		const online = useOnlineStatus();

		if (!online) {
			return <OfflineHomeNotice />;
		}

		return (
			<BookContextMenuRoot>
				<div className="relative space-y-4 px-3 py-6 md:px-6 md:py-6 lg:px-8 lg:py-8">
					<ContinueReadingSection />
					<ContinueListeningSection />
					<RecentlyAddedSection />
					<BookSeriesSection />
					<RecentlyAddedAudiobooksSection />
					<AudiobookSeriesSection />
					<RandomBooksSection />
				</div>
			</BookContextMenuRoot>
		);
	},
);
