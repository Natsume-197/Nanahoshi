import { ArrowLineDown, CloudSlash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type JSX, memo } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { FilterChipsSkeleton } from "@/components/shared/filter-chips";
import { Button } from "@/components/ui/button";
import { useCachedBooks } from "@/hooks/use-cached-books";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { type HomeScope, useHomeScope } from "@/lib/home-scope-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueListeningSection } from "./continue-listening-section";
import { ContinueReadingSection } from "./continue-reading-section";
import { ContinueSection } from "./continue-section";
import { EmptyLibraryNotice } from "./empty-library-notice";
import { HomeFormatToggle } from "./home-format-toggle";
import { PopularSection } from "./popular-section";
import { RandomAudiobooksSection } from "./random-audiobooks-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedAudiobooksSection } from "./recently-added-audiobooks-section";
import { RecentlyAddedSection } from "./recently-added-section";
import { RecommendationsSection } from "./recommendation-mixes";
import { ResumeTileSectionSkeleton, SectionSkeleton } from "./section-skeleton";
import { YourCollectionsSection } from "./your-collections-section";

// Mirrors the loaded page's structure exactly — the format chips and the
// gap-6/gap-12 rhythm included — so nothing shifts when the data lands.
function DashboardHomeSkeleton(): JSX.Element {
	return (
		<div
			className="relative flex flex-col gap-6 px-4 pt-4 pb-8 md:px-6 md:pt-8 lg:px-8"
			aria-busy="true"
		>
			<span className="sr-only">{m["common.loading"]()}</span>
			<FilterChipsSkeleton count={3} />
			<div className="flex flex-col gap-12">
				<ResumeTileSectionSkeleton />
				<SectionSkeleton />
				<SectionSkeleton square />
				<SectionSkeleton />
			</div>
		</div>
	);
}

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

		// Format availability is a bootstrap requirement for this page. Waiting for
		// the cheap EXISTS query prevents a mono-format server from first rendering
		// the mixed panel and chips, then shifting the whole dashboard when one
		// format disappears.
		const { data: formats } = useQuery(
			orpc.books.availableFormats.queryOptions({ staleTime: 60_000 }),
		);

		if (!online) {
			return <OfflineHomeNotice />;
		}

		if (formats === undefined) {
			return <DashboardHomeSkeleton />;
		}

		const hasBooks = formats.books;
		const hasAudiobooks = formats.audiobooks;

		// Effective scope honors the stored choice but falls back when that format
		// has no content — derived, not written back to the store during render.
		const effectiveScope: HomeScope =
			scope === "all" && !(hasBooks && hasAudiobooks)
				? hasBooks
					? "books"
					: "audiobooks"
				: scope === "audiobooks" && !hasAudiobooks && hasBooks
					? "books"
					: scope === "books" && !hasBooks && hasAudiobooks
						? "audiobooks"
						: scope;

		// Both panels stay mounted so switching format is a pure CSS show/hide —
		// no unmount means no refetch and no re-randomized sections. The active
		// panel mounts immediately; the other is warmed once we confirm it exists,
		// so a single-format library never fires the other format's queries.
		const showBooksPanel =
			effectiveScope === "books" ||
			(effectiveScope === "audiobooks" && hasBooks);
		const showAudiobooksPanel =
			effectiveScope === "audiobooks" ||
			(effectiveScope === "books" && hasAudiobooks);

		// A server with no content at all would otherwise render an empty page:
		// both format panels hide their sections. Show the onboarding notice
		// (create your first library / ask an admin) instead.
		if (!hasBooks && !hasAudiobooks) {
			return (
				<div className="px-4 pt-4 pb-8 md:px-6 md:pt-8 lg:px-8">
					<EmptyLibraryNotice />
				</div>
			);
		}

		return (
			<BookContextMenuRoot>
				<div className="relative flex flex-col gap-6 px-4 pt-4 pb-8 md:px-6 md:pt-8 lg:px-8">
					<HomeFormatToggle
						scope={effectiveScope}
						hasBooks={hasBooks}
						hasAudiobooks={hasAudiobooks}
					/>
					{effectiveScope === "all" ? (
						<div className="scope-in flex flex-col gap-12">
							<ContinueSection />
							{hasBooks ? <RecommendationsSection format="books" /> : null}
							{hasBooks ? <PopularSection format="books" /> : null}
							{hasBooks ? <RecentlyAddedSection /> : null}
							{hasAudiobooks ? (
								<RecommendationsSection format="audiobooks" />
							) : null}
							{hasAudiobooks ? <PopularSection format="audiobooks" /> : null}
							{hasAudiobooks ? <RecentlyAddedAudiobooksSection /> : null}
						</div>
					) : null}
					{showBooksPanel ? (
						<div
							className={cn(
								"flex flex-col gap-12",
								effectiveScope === "books" ? "scope-in" : "hidden",
							)}
						>
							{effectiveScope === "books" ? <ContinueReadingSection /> : null}
							{effectiveScope === "books" ? (
								<RecommendationsSection format="books" />
							) : null}
							{effectiveScope === "books" ? (
								<PopularSection format="books" />
							) : null}
							{effectiveScope === "books" ? <YourCollectionsSection /> : null}
							{effectiveScope === "books" ? <RecentlyAddedSection /> : null}
							{effectiveScope === "books" ? <BookSeriesSection /> : null}
							{effectiveScope === "books" ? <RandomBooksSection /> : null}
						</div>
					) : null}
					{showAudiobooksPanel ? (
						<div
							className={cn(
								"flex flex-col gap-12",
								effectiveScope === "audiobooks" ? "scope-in" : "hidden",
							)}
						>
							{effectiveScope === "audiobooks" ? (
								<ContinueListeningSection />
							) : null}
							{effectiveScope === "audiobooks" ? (
								<RecommendationsSection format="audiobooks" />
							) : null}
							{effectiveScope === "audiobooks" ? (
								<PopularSection format="audiobooks" />
							) : null}
							{effectiveScope === "audiobooks" ? (
								<YourCollectionsSection />
							) : null}
							{effectiveScope === "audiobooks" ? (
								<RecentlyAddedAudiobooksSection />
							) : null}
							{effectiveScope === "audiobooks" ? (
								<AudiobookSeriesSection />
							) : null}
							{effectiveScope === "audiobooks" ? (
								<RandomAudiobooksSection />
							) : null}
						</div>
					) : null}
				</div>
			</BookContextMenuRoot>
		);
	},
);
