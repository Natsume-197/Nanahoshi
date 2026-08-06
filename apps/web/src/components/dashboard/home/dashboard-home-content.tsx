import { ArrowLineDown, CloudSlash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, type JSX, memo } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { buttonVariants } from "@/components/ui/button";
import { useCachedBooks } from "@/hooks/use-cached-books";
import { useOnlineStatus } from "@/hooks/use-online-status";
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
import { RecentlyAddedSection } from "./recently-added-section";
import { RecommendationsSection } from "./recommendation-mixes";
import { ResumeSectionSkeleton, SectionSkeleton } from "./section-skeleton";
import { YourCollectionsSection } from "./your-collections-section";

// Mirrors the loaded page's structure so nothing shifts when the data lands.
function DashboardHomeSkeleton({
	layout,
}: {
	layout: readonly HomeSectionPreference[];
}): JSX.Element {
	return (
		<div
			className={cn(
				PAGE_GUTTER,
				"relative flex flex-col gap-8 pt-5 pb-8 md:gap-10 md:pt-8",
			)}
			aria-busy="true"
		>
			<span className="sr-only">{m["common.loading"]()}</span>
			<div className="flex flex-col gap-12">
				{layout
					.filter((item) => item.visible)
					.slice(0, 4)
					.map((item) =>
						item.id === "continue" ? (
							<ResumeSectionSkeleton key={item.id} />
						) : (
							<SectionSkeleton
								key={item.id}
								square={
									item.id === "audiobooks-for-you" ||
									item.id === "audiobook-series"
								}
							/>
						),
					)}
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
						<HomeSection id={item.id} />
					</Fragment>
				) : null,
			)}
		</>
	);
}

function OfflineHomeNotice() {
	const { data: books } = useCachedBooks();
	const count = books?.length ?? 0;

	return (
		<div
			className={cn(
				PAGE_GUTTER,
				"relative flex flex-col gap-8 pt-5 pb-8 md:gap-10 md:pt-8",
			)}
		>
			<div className="flex min-h-72 flex-col items-center justify-center gap-4 py-12 text-center">
				<div className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground shadow-card">
					<CloudSlash aria-hidden="true" className="size-7" />
				</div>
				<div className="flex max-w-md flex-col gap-1.5">
					<h2 className="text-balance font-semibold text-xl leading-tight">
						{m["home.offline_title"]()}
					</h2>
					<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
						{count > 0
							? m["home.offline_ready"]({ count })
							: m["home.offline_empty"]()}
					</p>
				</div>
				{count > 0 && (
					<Link
						to="/dashboard/downloads"
						className={buttonVariants({ variant: "default" })}
					>
						<ArrowLineDown data-icon="inline-start" aria-hidden="true" />
						{m["home.view_downloads"]()}
					</Link>
				)}
			</div>
		</div>
	);
}

export const DashboardHomeContent = memo(
	function DashboardHomeContent(): JSX.Element {
		const online = useOnlineStatus();
		const layout = useHomeLayout();

		// Format availability is still the cheapest way to distinguish an empty
		// server before mounting the personalized mixed dashboard.
		const { data: formats } = useQuery(
			orpc.books.availableFormats.queryOptions({ staleTime: 60_000 }),
		);

		if (!online) {
			return <OfflineHomeNotice />;
		}

		if (formats === undefined) {
			return <DashboardHomeSkeleton layout={layout} />;
		}

		const hasBooks = formats.books;
		const hasAudiobooks = formats.audiobooks;

		// A server with no content at all gets the onboarding notice instead of an
		// empty personalized dashboard.
		if (!hasBooks && !hasAudiobooks) {
			return (
				<div
					className={cn(
						PAGE_GUTTER,
						"relative flex flex-col gap-8 pt-5 pb-8 md:gap-10 md:pt-8",
					)}
				>
					<EmptyLibraryNotice />
				</div>
			);
		}

		return (
			<BookContextMenuRoot>
				<div
					className={cn(
						PAGE_GUTTER,
						"relative flex flex-col gap-8 pt-5 pb-8 md:gap-10 md:pt-8",
					)}
				>
					<div className="flex flex-col gap-12">
						<OrderedHomeSections layout={layout} />
					</div>
				</div>
			</BookContextMenuRoot>
		);
	},
);
