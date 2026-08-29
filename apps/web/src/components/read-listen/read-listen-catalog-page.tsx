import type { ReadListenPairing } from "@nanahoshi-v2/api/routers/read-listen/read-listen.service";
import { BookOpen, Headphones, Sparkle } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { CollectionSearch } from "@/components/shared/collection-search";
import { CollectionView } from "@/components/shared/collection-view";
import { EmptyState } from "@/components/shared/empty-state";
import {
	FilterBar,
	FilterField,
	FilterSelect,
} from "@/components/shared/filter-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { useCollectionView } from "@/hooks/use-collection-view";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	BOOK_GRID_CLASS,
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { ReadListenMatchReview } from "./read-listen-match-review";

type Publication = ReadListenPairing["ebook"];
type ReadListenSort = "recent" | "title" | "author";
type AlignmentFilter = "any" | "ready" | "not_imported" | "stale";

const routeApi = getRouteApi("/dashboard/read-listen");

function PublicationArtwork({
	publication,
	square = false,
}: {
	publication: Publication;
	square?: boolean;
}) {
	const coverFilename = getCoverFilename(publication.cover);
	if (!coverFilename) {
		return (
			<div
				aria-hidden="true"
				className={cn(
					"grid shrink-0 place-items-center rounded-md bg-muted text-muted-foreground",
					square ? "size-14" : "h-14 w-10",
				)}
			>
				{square ? (
					<Headphones className="size-5" />
				) : (
					<BookOpen className="size-5" />
				)}
			</div>
		);
	}

	return (
		<img
			alt=""
			width={square ? 56 : 40}
			height={56}
			loading="lazy"
			src={getCoverPresetUrl(coverFilename, coverPresets.thumbnail)}
			srcSet={getCoverSrcSet(coverFilename, coverPresets.thumbnail.widths)}
			sizes={coverPresets.thumbnail.sizes}
			className={cn(
				"shrink-0 rounded-md object-cover",
				COVER_EDGE,
				square ? "size-14" : "h-14 w-10",
			)}
		/>
	);
}

export function ReadListenPairLinks({
	pairing,
}: {
	pairing: ReadListenPairing;
}) {
	const publications = [
		{
			publication: pairing.ebook,
			label: m["read_listen.ebook"](),
			to: "/dashboard/books/$uuid" as const,
			square: false,
		},
		{
			publication: pairing.audiobook,
			label: m["read_listen.audiobook"](),
			to: "/dashboard/audiobooks/$uuid" as const,
			square: true,
		},
	] as const;

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{publications.map(({ publication, label, to, square }) => (
				<Link
					key={publication.uuid}
					to={to}
					params={{ uuid: publication.uuid }}
					preload="intent"
					className="group flex min-w-0 items-center gap-3 rounded-lg p-2 text-start hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<PublicationArtwork publication={publication} square={square} />
					<span className="min-w-0">
						<span className="block text-muted-foreground text-xs">{label}</span>
						<span className="block truncate font-medium text-sm group-hover:underline">
							{publication.title}
						</span>
						{publication.authors.length > 0 && (
							<span className="block truncate text-muted-foreground text-xs">
								{formatNames(publication.authors)}
							</span>
						)}
					</span>
				</Link>
			))}
		</div>
	);
}

function CoverImage({
	cover,
	alt,
	className,
}: {
	cover: string | null;
	alt: string;
	className: string;
}) {
	const coverFilename = getCoverFilename(cover);
	return coverFilename ? (
		<img
			alt={alt}
			loading="lazy"
			decoding="async"
			src={getCoverPresetUrl(coverFilename, coverPresets.card)}
			srcSet={getCoverSrcSet(coverFilename, coverPresets.card.widths)}
			sizes={coverPresets.card.sizes}
			className={className}
		/>
	) : null;
}

function StackedPairCover({ pairing }: { pairing: ReadListenPairing }) {
	const ebookCover = getCoverFilename(pairing.ebook.cover);
	const audiobookCover = getCoverFilename(pairing.audiobook.cover);

	return (
		<div
			className={cn(
				"relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted",
				COVER_EDGE,
			)}
		>
			<div className="absolute inset-0">
				{ebookCover ? (
					<CoverImage
						cover={pairing.ebook.cover}
						alt=""
						className="size-full object-cover"
					/>
				) : (
					<div className="grid size-full place-items-center text-muted-foreground">
						<BookOpen aria-hidden="true" className="size-7" />
					</div>
				)}
			</div>

			<div
				aria-hidden="true"
				className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent"
			/>
			<div
				className={cn(
					"absolute right-[6%] bottom-[5%] aspect-square w-[68%] overflow-hidden rounded-md bg-muted shadow-black/40 shadow-xl",
					COVER_EDGE,
				)}
			>
				{audiobookCover ? (
					<CoverImage
						cover={pairing.audiobook.cover}
						alt=""
						className="size-full object-cover"
					/>
				) : (
					<div className="grid size-full place-items-center text-muted-foreground">
						<Headphones aria-hidden="true" className="size-9" />
					</div>
				)}
			</div>
		</div>
	);
}

export function PairGridCard({ pairing }: { pairing: ReadListenPairing }) {
	const title = pairing.audiobook.title;
	const authorText = formatNames(pairing.audiobook.authors);

	return (
		<Link
			to="/dashboard/audiobooks/$uuid"
			params={{ uuid: pairing.audiobook.uuid }}
			preload="intent"
			aria-label={title}
			className="group relative isolate flex flex-col gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -inset-x-1.5 -inset-y-1 -z-10 rounded-2xl bg-surface-hover opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-200 md:-inset-2"
			/>
			<StackedPairCover pairing={pairing} />
			<div className="min-h-[4.9375rem] px-0.5">
				<p className="line-clamp-2 font-medium text-base leading-relaxed">
					{title}
				</p>
				{authorText && (
					<p className="line-clamp-1 text-muted-foreground text-sm leading-relaxed">
						{authorText}
					</p>
				)}
			</div>
		</Link>
	);
}

function PairGridSkeleton() {
	return (
		<div className={BOOK_GRID_CLASS} aria-busy="true">
			{[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
				<div key={index} className="flex flex-col gap-3">
					<div className="relative aspect-[2/3] overflow-hidden rounded-md">
						<Skeleton className="absolute inset-0" />
						<Skeleton className="absolute right-[6%] bottom-[5%] aspect-square w-[68%] rounded-md" />
					</div>
					<div className="space-y-2 px-0.5">
						<Skeleton className="h-4 w-4/5 rounded" />
						<Skeleton className="h-3 w-3/5 rounded" />
					</div>
				</div>
			))}
		</div>
	);
}

export function ReadListenCatalogPage() {
	const { can } = useAbilities();
	const routeSearch = routeApi.useSearch();
	const navigate = routeApi.useNavigate();
	const canManagePairings = can("book", "editMetadata");
	const isReviewingMatches = routeSearch.review === "matches";
	const [alignment, setAlignment] = useState<AlignmentFilter>("ready");
	const setIsReviewingMatches = (reviewing: boolean) =>
		navigate({
			search: (previous) => ({
				...previous,
				review: reviewing ? "matches" : undefined,
			}),
			replace: true,
		});
	const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			...orpc.readListen.listPairings.infiniteOptions({
				input: (pageParam: number) => ({
					offset: pageParam,
					limit: 30,
					alignment,
				}),
				initialPageParam: 0,
				getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
			}),
		});
	const pairings = data?.pages.flatMap((page) => page.items) ?? [];
	const { sort, setSort, search, setSearch, query, isSearching } =
		useCollectionView<ReadListenSort>({
			storageKey: "nh-read-listen-view",
			defaultSort: "recent",
		});
	const [ebookLibraryUuid, setEbookLibraryUuid] = useState("any");
	const [audiobookLibraryUuid, setAudiobookLibraryUuid] = useState("any");
	const { ebookLibraryOptions, audiobookLibraryOptions } = useMemo(() => {
		const ebookLibraries = new Map<string, string>();
		const audiobookLibraries = new Map<string, string>();
		for (const pairing of pairings ?? []) {
			ebookLibraries.set(
				pairing.ebook.libraryUuid,
				pairing.ebook.libraryName ?? m["library.untitled"](),
			);
			audiobookLibraries.set(
				pairing.audiobook.libraryUuid,
				pairing.audiobook.libraryName ?? m["library.untitled"](),
			);
		}
		const toOptions = (libraries: Map<string, string>) => [
			{ value: "any", label: m["common.any"]() },
			...Array.from(libraries, ([value, label]) => ({ value, label })).sort(
				(a, b) => a.label.localeCompare(b.label),
			),
		];
		return {
			ebookLibraryOptions: toOptions(ebookLibraries),
			audiobookLibraryOptions: toOptions(audiobookLibraries),
		};
	}, [pairings]);
	const visiblePairings = useMemo(() => {
		const normalizedQuery = query.toLocaleLowerCase();
		const matchesQuery = (pairing: ReadListenPairing) =>
			[
				pairing.ebook.title,
				pairing.ebook.filename,
				...pairing.ebook.authors.map((author) => author.name),
				pairing.audiobook.title,
				pairing.audiobook.filename,
				...pairing.audiobook.authors.map((author) => author.name),
				...pairing.audiobook.narrators.map((narrator) => narrator.name),
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(normalizedQuery);
		const filtered = (pairings ?? []).filter(
			(pairing) =>
				matchesQuery(pairing) &&
				(ebookLibraryUuid === "any" ||
					pairing.ebook.libraryUuid === ebookLibraryUuid) &&
				(audiobookLibraryUuid === "any" ||
					pairing.audiobook.libraryUuid === audiobookLibraryUuid),
		);

		return filtered.sort((a, b) => {
			if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
			if (sort === "author") {
				return (formatNames(a.audiobook.authors) ?? "").localeCompare(
					formatNames(b.audiobook.authors) ?? "",
				);
			}
			return (a.audiobook.title ?? "").localeCompare(b.audiobook.title ?? "");
		});
	}, [pairings, query, ebookLibraryUuid, audiobookLibraryUuid, sort]);
	const hasActiveFilters =
		isSearching ||
		ebookLibraryUuid !== "any" ||
		audiobookLibraryUuid !== "any" ||
		alignment !== "any";
	const sortOptions = [
		{ value: "recent", label: m["library_page.sort_recently_added"]() },
		{ value: "title", label: m["common.title"]() },
		{ value: "author", label: m["common.author"]() },
	] as const;
	const alignmentOptions = [
		{ value: "any", label: m["common.any"]() },
		{ value: "ready", label: m["read_listen.status_ready"]() },
		{ value: "not_imported", label: m["read_listen.status_not_imported"]() },
		{ value: "stale", label: m["read_listen.status_stale"]() },
	] as const;
	const filterBar = (
		<FilterBar>
			<FilterField
				label={m["library_page.search"]()}
				className="col-span-full lg:col-span-2"
			>
				<CollectionSearch
					value={search}
					onChange={setSearch}
					placeholder={m["read_listen.search_placeholder"]()}
					ariaLabel={m["read_listen.search_aria"]()}
					className="sm:w-full"
				/>
			</FilterField>
			{ebookLibraryOptions.length > 2 && (
				<FilterField label={m["read_listen.ebook_library"]()}>
					<FilterSelect
						value={ebookLibraryUuid}
						onChange={setEbookLibraryUuid}
						options={ebookLibraryOptions}
						ariaLabel={m["read_listen.filter_ebook_library_aria"]()}
					/>
				</FilterField>
			)}
			{audiobookLibraryOptions.length > 2 && (
				<FilterField label={m["read_listen.audiobook_library"]()}>
					<FilterSelect
						value={audiobookLibraryUuid}
						onChange={setAudiobookLibraryUuid}
						options={audiobookLibraryOptions}
						ariaLabel={m["read_listen.filter_audiobook_library_aria"]()}
					/>
				</FilterField>
			)}
			<FilterField label={m["read_listen.alignment"]()}>
				<FilterSelect
					value={alignment}
					onChange={(value) => setAlignment(value as AlignmentFilter)}
					options={alignmentOptions}
					ariaLabel={m["read_listen.filter_alignment_aria"]()}
				/>
			</FilterField>
			<FilterField label={m["common.sort"]()}>
				<FilterSelect
					value={sort}
					onChange={(value) => setSort(value as ReadListenSort)}
					options={sortOptions}
					ariaLabel={m["library_page.sort_aria"]()}
				/>
			</FilterField>
		</FilterBar>
	);
	if (isReviewingMatches) {
		return (
			<ReadListenMatchReview onBack={() => setIsReviewingMatches(false)} />
		);
	}

	return (
		<BookContextMenuRoot mediaType="audiobook">
			<CollectionView
				title={m["nav.read_listen"]()}
				subtitle={m["read_listen.page_description"]()}
				isLoading={isLoading}
				search={search}
				onSearchChange={setSearch}
				searchPlaceholder={m["read_listen.search_placeholder"]()}
				searchAriaLabel={m["read_listen.search_aria"]()}
				isSearching={hasActiveFilters}
				query={query}
				sort={sort}
				onSortChange={setSort}
				sortOptions={sortOptions}
				sortAriaLabel={m["library_page.sort_aria"]()}
				filterBar={filterBar}
				extraActions={
					canManagePairings ? (
						<Button
							variant="outline"
							onClick={() => setIsReviewingMatches(true)}
						>
							<Sparkle aria-hidden="true" data-icon="inline-start" />
							{m["read_listen.review_matches"]()}
						</Button>
					) : undefined
				}
				items={visiblePairings}
				hasNextPage={hasNextPage}
				fetchNextPage={() => void fetchNextPage()}
				isFetchingNextPage={isFetchingNextPage}
				getKey={(pairing) => pairing.id}
				gridRowEstimate={({ columnWidth }) => columnWidth * 1.5 + 79}
				gridSkeleton={<PairGridSkeleton />}
				renderGridItem={(pairing) => (
					<BookContextMenuTrigger
						bookUuid={pairing.audiobook.uuid}
						mediaType="audiobook"
					>
						<PairGridCard pairing={pairing} />
					</BookContextMenuTrigger>
				)}
				emptyState={
					<EmptyState
						title={m["read_listen.empty_title"]()}
						description={m["read_listen.empty_description"]()}
					/>
				}
				searchEmptyState={
					<EmptyState
						title={m["settings.no_matches"]()}
						description={m["read_listen.no_query_matches"]({ query })}
					/>
				}
			/>
		</BookContextMenuRoot>
	);
}
