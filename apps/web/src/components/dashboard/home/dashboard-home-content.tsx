import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, CloudOff } from "lucide-react";
import { type JSX, memo } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { Button } from "@/components/ui/button";
import { useResumeHero } from "@/hooks/books/use-resume-hero";
import { useCachedBooks } from "@/hooks/use-cached-books";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { m } from "@/paraglide/messages";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueListeningSection } from "./continue-listening-section";
import { ContinueReadingSection } from "./continue-reading-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedAudiobooksSection } from "./recently-added-audiobooks-section";
import { RecentlyAddedSection } from "./recently-added-section";
import { ResumeHero } from "./resume-hero";

function OfflineHomeNotice() {
	const { data: books } = useCachedBooks();
	const count = books?.length ?? 0;

	return (
		<div className="flex flex-col items-center gap-3 py-24 text-center">
			<CloudOff
				className="size-12 text-muted-foreground/40"
				strokeWidth={1.5}
			/>
			<p className="font-medium text-lg">{m["home.offline_title"]()}</p>
			<p className="max-w-sm text-muted-foreground text-sm">
				{count > 0
					? m["home.offline_ready"]({ count })
					: m["home.offline_empty"]()}
			</p>
			{count > 0 && (
				<Button asChild className="mt-2">
					<Link to="/dashboard/downloads">
						<ArrowDownToLine className="size-4" />
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
		const { hero } = useResumeHero();

		if (!online) {
			return <OfflineHomeNotice />;
		}

		// The hero already surfaces the single most-recent title; drop it from its
		// own row so it never appears twice in a row.
		const excludeReading = hero?.kind === "ebook" ? hero.uuid : undefined;
		const excludeListening = hero?.kind === "audiobook" ? hero.uuid : undefined;

		return (
			<BookContextMenuRoot>
				<div className="relative space-y-6 px-3 py-6 md:px-6 md:py-6 lg:px-8 lg:py-8">
					<ResumeHero />
					<ContinueReadingSection excludeUuid={excludeReading} />
					<ContinueListeningSection excludeUuid={excludeListening} />
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
