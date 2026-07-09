import { ArrowLineDown, CloudSlash } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { type JSX, memo } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { Button } from "@/components/ui/button";
import { useCachedBooks } from "@/hooks/use-cached-books";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useHomeScope } from "@/lib/home-scope-store";
import { m } from "@/paraglide/messages";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueListeningSection } from "./continue-listening-section";
import { ContinueReadingSection } from "./continue-reading-section";
import { HomeFormatToggle } from "./home-format-toggle";
import { RandomAudiobooksSection } from "./random-audiobooks-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedAudiobooksSection } from "./recently-added-audiobooks-section";
import { RecentlyAddedSection } from "./recently-added-section";

function OfflineHomeNotice() {
	const { data: books } = useCachedBooks();
	const count = books?.length ?? 0;

	return (
		<div className="flex flex-col items-center gap-3 py-24 text-center">
			<CloudSlash className="size-12 text-muted-foreground/40" weight="light" />
			<p className="font-medium text-lg">{m["home.offline_title"]()}</p>
			<p className="max-w-sm text-muted-foreground text-sm">
				{count > 0
					? m["home.offline_ready"]({ count })
					: m["home.offline_empty"]()}
			</p>
			{count > 0 && (
				<Button asChild className="mt-2">
					<Link to="/dashboard/downloads">
						<ArrowLineDown className="size-4" />
						{m["home.view_downloads"]()}
					</Link>
				</Button>
			)}
		</div>
	);
}

export const DashboardHomeContent = memo(
	function DashboardHomeContent(): JSX.Element {
		const online = useOnlineStatus();
		// Format is picked by the navbar's Books/Audiobooks pills.
		const scope = useHomeScope();

		if (!online) {
			return <OfflineHomeNotice />;
		}

		return (
			<BookContextMenuRoot>
				<div className="relative space-y-8 px-3 py-8 md:px-6 lg:px-8">
					<HomeFormatToggle />
					{scope === "books" ? (
						<div className="space-y-8">
							<ContinueReadingSection />
							<RecentlyAddedSection />
							<BookSeriesSection />
							<RandomBooksSection />
						</div>
					) : (
						<div className="space-y-8">
							<ContinueListeningSection />
							<RecentlyAddedAudiobooksSection />
							<AudiobookSeriesSection />
							<RandomAudiobooksSection />
						</div>
					)}
				</div>
			</BookContextMenuRoot>
		);
	},
);
