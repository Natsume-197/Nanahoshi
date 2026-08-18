import { useQuery } from "@tanstack/react-query";
import { Fragment, type JSX, memo } from "react";
import { BookCardPresentationProvider } from "@/components/books/book-card-presentation-context";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import {
	type HomeSectionId,
	type HomeSectionPreference,
	useHomeLayout,
} from "@/lib/home-layout-store";
import { PAGE_GUTTER } from "@/lib/page-layout";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueSection } from "./continue-section";
import { EmptyLibraryNotice } from "./empty-library-notice";
import { PopularSection } from "./popular-section";
import { RandomAudiobooksSection } from "./random-audiobooks-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedSection } from "./recently-added-section";
import { RecommendationsSection } from "./recommendation-mixes";
import { ResumeSectionSkeleton, SectionSkeleton } from "./section-skeleton";
import { YourCollectionsSection } from "./your-collections-section";

// Shared by every home state so they all start at the same place on the panel.
// The rhythm BETWEEN rails lives on the section stack below, never here: this
// wrapper holds a single child, so a gap on it would go nowhere.
const HOME_SHELL_CLASS = "relative flex flex-col pt-5 pb-8 md:pt-8";
// 32px between rails on phones, 48 from md. On a ~700px-tall screen that gap is
// the difference between seeing two rails and seeing one and a half.
const HOME_SECTION_STACK_CLASS = "flex flex-col gap-8 md:gap-12";

// Mirrors the loaded page's structure so nothing shifts when the data lands.
function DashboardHomeSkeleton({
	layout,
}: {
	layout: readonly HomeSectionPreference[];
}): JSX.Element {
	return (
		<div className={cn(PAGE_GUTTER, HOME_SHELL_CLASS)} aria-busy="true">
			<span className="sr-only">{m["common.loading"]()}</span>
			<div className={HOME_SECTION_STACK_CLASS}>
				{layout
					.filter((item) => item.visible)
					.slice(0, 4)
					.map((item) => (
						<BookCardPresentationProvider
							key={item.id}
							value={item.carouselStyle}
						>
							{item.id === "continue" ? (
								<ResumeSectionSkeleton />
							) : (
								<SectionSkeleton
									square={
										item.id === "audiobooks-for-you" ||
										item.id === "audiobook-series" ||
										item.id === "random-audiobooks"
									}
								/>
							)}
						</BookCardPresentationProvider>
					))}
			</div>
		</div>
	);
}

function HomeSection({ id }: { id: HomeSectionId }): JSX.Element {
	switch (id) {
		case "continue":
			return <ContinueSection />;
		case "books-for-you":
			return <RecommendationsSection format="books" />;
		case "audiobooks-for-you":
			return <RecommendationsSection format="audiobooks" />;
		case "popular":
			return <PopularSection format="all" />;
		case "your-collections":
			return <YourCollectionsSection />;
		case "recently-added":
			return <RecentlyAddedSection />;
		case "book-series":
			return <BookSeriesSection />;
		case "audiobook-series":
			return <AudiobookSeriesSection />;
		case "random-books":
			return <RandomBooksSection />;
		case "random-audiobooks":
			return <RandomAudiobooksSection />;
	}
}

function OrderedHomeSections({
	layout,
}: {
	layout: readonly HomeSectionPreference[];
}): JSX.Element {
	return (
		<>
			{layout.map((item) =>
				item.visible ? (
					<Fragment key={item.id}>
						<BookCardPresentationProvider value={item.carouselStyle}>
							<HomeSection id={item.id} />
						</BookCardPresentationProvider>
					</Fragment>
				) : null,
			)}
		</>
	);
}

export const DashboardHomeContent = memo(
	function DashboardHomeContent(): JSX.Element {
		const layout = useHomeLayout();

		// Format availability is still the cheapest way to distinguish an empty
		// server before mounting the personalized mixed dashboard.
		const { data: formats } = useQuery(
			orpc.books.availableFormats.queryOptions({ staleTime: 60_000 }),
		);

		if (formats === undefined) {
			return <DashboardHomeSkeleton layout={layout} />;
		}

		const hasBooks = formats.books;
		const hasAudiobooks = formats.audiobooks;

		// A server with no content at all gets the onboarding notice instead of an
		// empty personalized dashboard.
		if (!hasBooks && !hasAudiobooks) {
			return (
				<div className={cn(PAGE_GUTTER, HOME_SHELL_CLASS)}>
					<EmptyLibraryNotice />
				</div>
			);
		}

		return (
			<BookContextMenuRoot>
				<div className={cn(PAGE_GUTTER, HOME_SHELL_CLASS)}>
					<div className={HOME_SECTION_STACK_CLASS}>
						<OrderedHomeSections layout={layout} />
					</div>
				</div>
			</BookContextMenuRoot>
		);
	},
);
