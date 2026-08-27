import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type JSX, memo, startTransition, useCallback, useState } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import {
	type HomeSectionId,
	type HomeSectionPreference,
	useHomeLayout,
} from "@/lib/home-layout-store";
import { PAGE_GUTTER } from "@/lib/page-layout";
import { getLocationRestoreKey } from "@/lib/scroll-restoration";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueSection } from "./continue-section";
import { EmptyLibraryNotice } from "./empty-library-notice";
import {
	getHomeProgressiveSnapshot,
	reportHomeSectionStatus,
	revealNextHomeSectionBatch,
	useHomeProgressiveSnapshot,
} from "./home-progressive-state";
import { HomeSectionPlaceholder } from "./home-section-placeholder";
import {
	type HomeSectionStatus,
	HomeSectionStatusProvider,
} from "./home-section-status";
import { PopularSection } from "./popular-section";
import {
	getActiveHomeSectionCount,
	getHomePrioritySectionCount,
	getOrderedVisibleSectionIds,
	getProgressiveHomePhase,
	getProgressiveHomeSectionHidden,
	HOME_PRIORITY_SECTION_COUNT,
} from "./progressive-home-sections";
import { ProgressiveSectionFooter } from "./progressive-section-footer";
import { RandomAudiobooksSection } from "./random-audiobooks-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedSection } from "./recently-added-section";
import { RecommendationsSection } from "./recommendation-mixes";
import { YourCollectionsSection } from "./your-collections-section";

// Shared by every home state so they all start at the same place on the panel.
// The rhythm BETWEEN rails lives on the section stack below, never here: this
// wrapper holds a single child, so a gap on it would go nowhere.
const HOME_SHELL_CLASS = "relative flex flex-col pt-5 pb-8 md:pt-8";
const HOME_COMPACT_SHELL_CLASS = "relative flex flex-col pt-3 pb-8 md:pt-4";
// 32px between rails on phones, 48 from md. On a ~700px-tall screen that gap is
// the difference between seeing two rails and seeing one and a half.
const HOME_SECTION_STACK_CLASS = "flex flex-col gap-8 md:gap-12";

// Mirrors the loaded page's structure so nothing shifts when the data lands.
function DashboardHomeSkeleton({
	layout,
	shellClass,
}: {
	layout: readonly HomeSectionPreference[];
	shellClass: string;
}): JSX.Element {
	return (
		<div className={cn(PAGE_GUTTER, shellClass)} aria-busy="true">
			<span className="sr-only">{m["common.loading"]()}</span>
			<div className={HOME_SECTION_STACK_CLASS}>
				{layout
					.filter((item) => item.visible)
					.slice(0, HOME_PRIORITY_SECTION_COUNT)
					.map((item) => (
						<HomeSectionPlaceholder key={item.id} id={item.id} />
					))}
			</div>
		</div>
	);
}

function HomeSection({
	id,
	onStatus,
	suppressLoadingPlaceholder,
}: {
	id: HomeSectionId;
	onStatus: (status: HomeSectionStatus) => void;
	suppressLoadingPlaceholder: boolean;
}): JSX.Element {
	let section: JSX.Element;
	switch (id) {
		case "continue":
			section = <ContinueSection />;
			break;
		case "books-for-you":
			section = <RecommendationsSection format="books" />;
			break;
		case "audiobooks-for-you":
			section = <RecommendationsSection format="audiobooks" />;
			break;
		case "popular":
			section = <PopularSection format="all" />;
			break;
		case "your-collections":
			section = <YourCollectionsSection />;
			break;
		case "recently-added":
			section = <RecentlyAddedSection />;
			break;
		case "book-series":
			section = <BookSeriesSection />;
			break;
		case "audiobook-series":
			section = <AudiobookSeriesSection />;
			break;
		case "random-books":
			section = <RandomBooksSection />;
			break;
		case "random-audiobooks":
			section = <RandomAudiobooksSection />;
			break;
	}
	return (
		<HomeSectionStatusProvider
			onStatus={onStatus}
			suppressLoadingPlaceholder={suppressLoadingPlaceholder}
		>
			{section}
		</HomeSectionStatusProvider>
	);
}

function OrderedHomeSections({
	layout,
	restoreKey,
}: {
	layout: readonly HomeSectionPreference[];
	restoreKey: string;
}): JSX.Element {
	const sections = layout.filter((item) => item.visible);
	const priorityCount = getHomePrioritySectionCount(sections.length);
	const { rawActiveCount, statuses } = useHomeProgressiveSnapshot(restoreKey);
	const [restoredPopulatedIds] = useState(
		() =>
			new Set(
				Object.entries(getHomeProgressiveSnapshot(restoreKey).statuses)
					.filter(([, status]) => status === "populated")
					.map(([id]) => id as HomeSectionId),
			),
	);
	const activeCount = getActiveHomeSectionCount({
		sectionIds: sections.map((section) => section.id),
		statuses,
		rawActiveCount,
		priorityCount,
	});
	const lastActiveIndex = activeCount - 1;
	const lastActive = sections[lastActiveIndex];
	const lastStatus = lastActive ? statuses[lastActive.id] : undefined;
	const hasPendingDeferred = sections
		.slice(priorityCount, activeCount)
		.some((section) => {
			const status = statuses[section.id];
			return status === undefined || status === "loading";
		});
	const orderedVisibleIds = new Set(
		getOrderedVisibleSectionIds(
			sections.slice(priorityCount, activeCount).map((section) => section.id),
			statuses,
		),
	);
	const phase = getProgressiveHomePhase({
		activeCount,
		totalCount: sections.length,
		priorityCount,
		lastStatus,
		hasPendingDeferred,
	});

	const reportStatus = useCallback(
		(id: HomeSectionId, status: HomeSectionStatus) => {
			startTransition(() => {
				reportHomeSectionStatus(restoreKey, id, status);
			});
		},
		[restoreKey],
	);

	const canRequestNext = phase === "waiting-for-viewport";
	const isLoadingDeferred = phase === "loading" && activeCount > priorityCount;
	const requestNext = useCallback(
		() =>
			startTransition(() => {
				revealNextHomeSectionBatch(restoreKey, sections.length, activeCount);
			}),
		[restoreKey, sections.length, activeCount],
	);

	return (
		<>
			{sections.slice(0, activeCount).map((item, index) => (
				<ProgressiveHomeSection
					key={item.id}
					id={item.id}
					deferred={index >= priorityCount}
					populated={index < priorityCount || orderedVisibleIds.has(item.id)}
					status={statuses[item.id]}
					animateReveal={!restoredPopulatedIds.has(item.id)}
					onStatus={reportStatus}
				/>
			))}
			<ProgressiveSectionFooter
				key={activeCount}
				loading={isLoadingDeferred}
				observe={canRequestNext}
				onVisible={requestNext}
			/>
		</>
	);
}

const ProgressiveHomeSection = memo(function ProgressiveHomeSection({
	id,
	deferred,
	populated,
	status,
	animateReveal,
	onStatus,
}: {
	id: HomeSectionId;
	deferred: boolean;
	populated: boolean;
	status: HomeSectionStatus | undefined;
	animateReveal: boolean;
	onStatus: (id: HomeSectionId, status: HomeSectionStatus) => void;
}): JSX.Element {
	const report = useCallback(
		(status: HomeSectionStatus) => onStatus(id, status),
		[id, onStatus],
	);
	const hidden = getProgressiveHomeSectionHidden(deferred, populated, status);
	return (
		<div
			className={cn(
				hidden && "hidden",
				deferred &&
					populated &&
					animateReveal &&
					"fade-in-0 slide-in-from-bottom-1 animate-in duration-200 ease-out-quart motion-reduce:animate-none",
			)}
		>
			<HomeSection
				id={id}
				onStatus={report}
				suppressLoadingPlaceholder={deferred}
			/>
		</div>
	);
});

export const DashboardHomeContent = memo(function DashboardHomeContent({
	compactTop = false,
}: {
	compactTop?: boolean;
}): JSX.Element {
	const layout = useHomeLayout();
	const router = useRouter();
	const shellClass = compactTop ? HOME_COMPACT_SHELL_CLASS : HOME_SHELL_CLASS;
	// Freeze the history entry for this mount: during navigation
	// router.latestLocation changes before this outgoing page unmounts.
	const [restoreKey] = useState(() =>
		getLocationRestoreKey(router.latestLocation),
	);

	// Format availability is still the cheapest way to distinguish an empty
	// server before mounting the personalized mixed dashboard.
	const { data: formats } = useQuery(
		orpc.books.availableFormats.queryOptions({ staleTime: 60_000 }),
	);

	if (formats === undefined) {
		return <DashboardHomeSkeleton layout={layout} shellClass={shellClass} />;
	}

	const hasBooks = formats.books;
	const hasAudiobooks = formats.audiobooks;

	// A server with no content at all gets the onboarding notice instead of an
	// empty personalized dashboard.
	if (!hasBooks && !hasAudiobooks) {
		return (
			<div className={cn(PAGE_GUTTER, shellClass)}>
				<EmptyLibraryNotice />
			</div>
		);
	}

	return (
		<BookContextMenuRoot>
			<div className={cn(PAGE_GUTTER, shellClass)}>
				<div className={HOME_SECTION_STACK_CLASS}>
					<OrderedHomeSections layout={layout} restoreKey={restoreKey} />
				</div>
			</div>
		</BookContextMenuRoot>
	);
});
