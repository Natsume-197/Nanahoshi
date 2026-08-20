import type { ReadListenPairing } from "@nanahoshi-v2/api/routers/read-listen/read-listen.service";
import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";
import {
	BookOpen,
	Books,
	CaretRight,
	CircleNotch,
	Clock,
	FolderSimple,
	Headphones,
	MagnifyingGlass,
	User,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import {
	BookContextMenuRoot,
	BookContextMenuTrigger,
} from "@/components/books/book-context-menu";
import { HitLink } from "@/components/dashboard/search/top-results-hit-link";
import { useScrollContainerRef } from "@/components/layout/scroll-container-context";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { PAGE_GUTTER } from "@/lib/page-layout";
import {
	getLocationRestoreKey,
	readUiSnapshot,
	saveUiSnapshot,
} from "@/lib/scroll-restoration";
import { searchResultKey } from "@/lib/search-result-batches";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	COVER_EDGE,
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";
import { client, orpc } from "@/utils/orpc";

type SearchTypeFilter =
	| "all"
	| "books"
	| "audiobooks"
	| "read-listen"
	| "series"
	| "authors"
	| "collections"
	| "users";

export const Route = createFileRoute("/dashboard/search")({
	component: SearchPage,
	head: () => ({
		meta: [{ title: `${m["search.results"]()} · Nanahoshi` }],
	}),
	validateSearch: (search: Record<string, unknown>) => ({
		q: (search.q as string) || "",
	}),
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
});

const SEARCH_MIN_QUERY_LENGTH = 1;
const SEARCH_TOP_RESULTS_LIMIT = 20;
const SKELETON_ROW_COUNT = 5;
const ROW_SKELETON_KEYS = Array.from(
	{ length: SKELETON_ROW_COUNT },
	(_, index) => `search-row-${index}`,
);
const CHIP_SKELETONS = [
	{ id: "chip-all", width: "w-14" },
	{ id: "chip-books", width: "w-20" },
	{ id: "chip-audio", width: "w-24" },
	{ id: "chip-authors", width: "w-20" },
];

const rowClassName =
	"group -mx-3 flex min-h-32 touch-manipulation items-center gap-4 rounded-xl px-3 py-3 text-start motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-surface-hover sm:gap-5";
const compactRowClassName =
	"group -mx-3 flex min-h-16 touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-start motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-surface-hover";

function FilterChipsSkeleton() {
	return (
		<div className="flex gap-2 overflow-hidden" aria-busy="true">
			{CHIP_SKELETONS.map(({ id, width }) => (
				<Skeleton
					key={id}
					className={cn(
						"h-11 shrink-0 rounded-full shadow-[0_0_0_1px_oklch(0_0_0/0.06)] dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)]",
						width,
					)}
				/>
			))}
		</div>
	);
}

function ResultListSkeleton({ title }: { title?: string }) {
	return (
		<section className="space-y-2" aria-busy="true">
			{title && (
				<h2 className="font-semibold text-xl tracking-tight">{title}</h2>
			)}
			<div>
				{ROW_SKELETON_KEYS.map((key) => (
					<div
						key={key}
						className="flex min-h-32 items-center gap-4 border-border/60 border-b py-3 last:border-b-0 sm:gap-5"
					>
						<div className="flex size-28 shrink-0 items-center justify-center">
							<Skeleton className="h-28 w-[4.625rem] rounded-md" />
						</div>
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-2/3 max-w-80 rounded" />
							<Skeleton className="h-3.5 w-1/2 max-w-56 rounded" />
							<Skeleton className="h-3 w-20 rounded" />
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

function ResultSection({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={id} className="space-y-2">
			<div className="flex min-h-11 items-center">
				<h2
					id={id}
					className="scroll-mt-20 text-balance font-semibold text-xl leading-snug tracking-tight"
				>
					{title}
				</h2>
			</div>
			<ul className="divide-y divide-border/60">{children}</ul>
		</section>
	);
}

function ResultRowContent({
	artwork,
	title,
	subtitle,
	meta,
}: {
	artwork: ReactNode;
	title: string;
	subtitle?: string | null;
	meta: string;
}) {
	return (
		<>
			{artwork}
			<div className="min-w-0 flex-1">
				<p
					title={title}
					className="line-clamp-2 break-words font-semibold text-base leading-snug tracking-[-0.01em]"
				>
					{title}
				</p>
				{subtitle && (
					<p
						title={subtitle}
						className="mt-1 line-clamp-2 break-words text-muted-foreground text-sm leading-normal"
					>
						{subtitle}
					</p>
				)}
				<p className="mt-1.5 font-medium text-muted-foreground text-xs tabular-nums leading-normal">
					{meta}
				</p>
			</div>
			<CaretRight
				aria-hidden="true"
				className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
				weight="bold"
			/>
		</>
	);
}

function CoverArtwork({
	cover,
	square = false,
	fallback,
}: {
	cover: string | null | undefined;
	square?: boolean;
	fallback: ReactNode;
}) {
	const filename = getCoverFilename(cover);
	return (
		<div className="flex size-28 shrink-0 items-center justify-center">
			<div
				className={cn(
					"flex items-center justify-center overflow-hidden bg-muted shadow-black/20 shadow-sm",
					square ? "size-20 rounded-lg" : "h-28 w-[4.625rem] rounded-md",
					COVER_EDGE,
				)}
			>
				{filename ? (
					<img
						src={getCoverPresetUrl(filename, coverPresets.thumbnail)}
						srcSet={getCoverSrcSet(filename, coverPresets.thumbnail.widths)}
						sizes="80px"
						alt=""
						className="size-full object-cover"
						loading="lazy"
						decoding="async"
						width={square ? 160 : 148}
						height={square ? 160 : 224}
					/>
				) : (
					fallback
				)}
			</div>
		</div>
	);
}

function SeriesArtwork({ covers }: { covers: string[] }) {
	const filenames = Array.from(
		new Set(
			covers
				.map(getCoverFilename)
				.filter((filename): filename is string => filename !== null),
		),
	).slice(0, 3);

	if (filenames.length === 0) {
		return (
			<div className="flex size-28 shrink-0 items-center justify-center">
				<div
					className={cn(
						"flex h-28 w-[4.625rem] items-center justify-center overflow-hidden rounded-md bg-muted shadow-black/20 shadow-sm",
						COVER_EDGE,
					)}
				>
					<Books aria-hidden="true" className="size-7 text-muted-foreground" />
				</div>
			</div>
		);
	}

	const deckWidth = 64 + (filenames.length - 1) * 16;
	const deckHeight = 98 + (filenames.length - 1) * 7;
	const inlineOffset = (112 - deckWidth) / 2;
	const blockOffset = (112 - deckHeight) / 2;

	return (
		<div className="relative size-28 shrink-0" aria-hidden="true">
			{filenames.map((filename, index) => (
				<div
					key={filename}
					className={cn(
						"absolute h-[98px] w-16 overflow-hidden rounded-[5px] bg-muted shadow-black/25 shadow-md",
						COVER_EDGE,
					)}
					style={{
						insetInlineStart: inlineOffset + index * 16,
						bottom: blockOffset + index * 7,
						zIndex: filenames.length - index,
					}}
				>
					<img
						src={getCoverPresetUrl(filename, coverPresets.thumbnail)}
						srcSet={getCoverSrcSet(filename, coverPresets.thumbnail.widths)}
						sizes="64px"
						alt=""
						className="size-full object-cover"
						loading="lazy"
						decoding="async"
						width={128}
						height={196}
					/>
				</div>
			))}
		</div>
	);
}

function PortraitArtwork({
	name,
	image,
}: {
	name: string;
	image?: string | null;
}) {
	return (
		<div className="flex size-28 shrink-0 items-center justify-center">
			{image !== undefined ? (
				<UserAvatar name={name} image={image} className="size-16" />
			) : (
				<div className="flex size-16 items-center justify-center rounded-full bg-muted ring-1 ring-border/60">
					<User aria-hidden="true" className="size-7 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}

function MediaResultRow({
	uuid,
	title,
	filename,
	cover,
	authors,
	mediaType,
}: {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	authors?: { name: string }[] | null;
	mediaType: "ebook" | "audiobook";
}) {
	const isAudiobook = mediaType === "audiobook";
	const displayTitle = title ?? filename;
	const authorText = formatNames(authors);
	const link = isAudiobook ? (
		<Link
			to="/dashboard/audiobooks/$uuid"
			params={{ uuid }}
			preload="intent"
			className={rowClassName}
		>
			<ResultRowContent
				artwork={
					<CoverArtwork
						cover={cover}
						square
						fallback={
							<Headphones
								aria-hidden="true"
								className="size-7 text-muted-foreground"
							/>
						}
					/>
				}
				title={displayTitle}
				subtitle={authorText}
				meta={m["media.audiobook"]()}
			/>
		</Link>
	) : (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid }}
			preload="intent"
			className={rowClassName}
		>
			<ResultRowContent
				artwork={
					<CoverArtwork
						cover={cover}
						fallback={
							<BookOpen
								aria-hidden="true"
								className="size-7 text-muted-foreground"
							/>
						}
					/>
				}
				title={displayTitle}
				subtitle={authorText}
				meta={m["media.book"]()}
			/>
		</Link>
	);

	return (
		<li>
			<BookContextMenuTrigger
				bookUuid={uuid}
				mediaType={mediaType}
				className="block"
			>
				{link}
			</BookContextMenuTrigger>
		</li>
	);
}

function RankedResultRow({ hit }: { hit: TopHit }) {
	if (hit.type === "book" || hit.type === "audiobook") {
		return (
			<MediaResultRow
				uuid={hit.uuid}
				title={hit.title}
				filename={hit.filename}
				cover={hit.cover}
				authors={hit.authors}
				mediaType={hit.type === "book" ? "ebook" : "audiobook"}
			/>
		);
	}
	if (hit.type === "read-listen") {
		return <ReadListenResultRow pairing={hit} />;
	}

	let artwork: ReactNode;
	let title: string;
	let subtitle: string | null | undefined;
	let meta: string;

	switch (hit.type) {
		case "series":
			artwork = <SeriesArtwork covers={hit.previewCovers} />;
			title = hit.name;
			subtitle = hit.author?.name;
			meta = `${m["nav.series"]()} · ${m["media.book_count"]({
				count: hit.bookCount,
			})}`;
			break;
		case "author":
			artwork = <PortraitArtwork name={hit.name} />;
			title = hit.name;
			meta = `${m["common.author"]()} · ${m["media.book_count"]({
				count: hit.bookCount,
			})}`;
			break;
		case "collection":
			artwork = (
				<CoverArtwork
					cover={hit.previewCovers[0]}
					square
					fallback={
						<FolderSimple
							aria-hidden="true"
							className="size-7 text-muted-foreground"
						/>
					}
				/>
			);
			title = hit.name;
			subtitle = m["search.collection_by"]({
				username: hit.ownerUsername ?? "",
			});
			meta = m["search.collections"]();
			break;
		case "user":
			artwork = (
				<PortraitArtwork
					name={hit.displayUsername ?? hit.name}
					image={hit.image}
				/>
			);
			title = hit.displayUsername ?? hit.name;
			subtitle = hit.username ? `@${hit.username}` : undefined;
			meta = m["search.users"]();
			break;
	}

	return (
		<li>
			<HitLink hit={hit} className={rowClassName}>
				<ResultRowContent
					artwork={artwork}
					title={title}
					subtitle={subtitle}
					meta={meta}
				/>
			</HitLink>
		</li>
	);
}

function InfiniteResultsLoader({
	hasNextPage,
	isFetching,
	onLoadMore,
}: {
	hasNextPage: boolean | undefined;
	isFetching: boolean;
	onLoadMore: () => void;
}) {
	const scrollContainerRef = useScrollContainerRef();
	const { loadMoreRef } = useInfiniteScroll({
		hasNextPage,
		isFetchingNextPage: isFetching,
		fetchNextPage: onLoadMore,
		enabled: Boolean(hasNextPage),
		root: scrollContainerRef?.current ?? null,
		rootMargin: "800px 0px",
	});

	if (!hasNextPage) return null;

	return (
		<div
			className="relative flex min-h-12 items-center justify-center"
			aria-live="polite"
			aria-busy={isFetching}
		>
			<div ref={loadMoreRef} className="h-px w-full" aria-hidden="true" />
			{isFetching && (
				<>
					<CircleNotch
						aria-hidden="true"
						className="absolute size-5 animate-spin text-muted-foreground"
						weight="bold"
					/>
					<span className="sr-only">{m["search.loading_results"]()}</span>
				</>
			)}
		</div>
	);
}

function SearchEmptyState({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<section className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
			<div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<MagnifyingGlass aria-hidden="true" className="size-5" weight="bold" />
			</div>
			<h2 className="text-balance font-semibold text-xl leading-snug tracking-tight">
				{title}
			</h2>
			<p className="mt-2 max-w-md text-pretty text-muted-foreground text-sm leading-relaxed">
				{description}
			</p>
		</section>
	);
}

function pairingMatchesQuery(pairing: ReadListenPairing, query: string) {
	const haystack = [
		pairing.ebook.title,
		pairing.ebook.filename,
		...pairing.ebook.authors.map((author) => author.name),
		pairing.audiobook.title,
		pairing.audiobook.filename,
		...pairing.audiobook.authors.map((author) => author.name),
		...pairing.audiobook.narrators.map((narrator) => narrator.name),
	]
		.join(" ")
		.toLocaleLowerCase();
	return haystack.includes(query.toLocaleLowerCase());
}

type ReadListenSearchResult = Extract<TopHit, { type: "read-listen" }>;

function ReadListenArtwork({ pairing }: { pairing: ReadListenSearchResult }) {
	const ebookCover = getCoverFilename(pairing.ebook.cover);
	const audiobookCover = getCoverFilename(pairing.audiobook.cover);

	return (
		<div className="relative size-28 shrink-0" aria-hidden="true">
			<div
				className={cn(
					"absolute inset-y-0 start-0 flex h-28 w-[4.625rem] items-center justify-center overflow-hidden rounded-md bg-muted shadow-black/20 shadow-sm",
					COVER_EDGE,
				)}
			>
				{ebookCover ? (
					<img
						src={getCoverPresetUrl(ebookCover, coverPresets.thumbnail)}
						srcSet={getCoverSrcSet(ebookCover, coverPresets.thumbnail.widths)}
						sizes="74px"
						alt=""
						className="size-full object-cover"
						loading="lazy"
						decoding="async"
						width={148}
						height={224}
					/>
				) : (
					<BookOpen className="size-7 text-muted-foreground" />
				)}
			</div>
			<div
				className={cn(
					"absolute end-0 bottom-0 z-10 flex size-20 items-center justify-center overflow-hidden rounded-lg bg-muted shadow-black/30 shadow-lg",
					COVER_EDGE,
				)}
			>
				{audiobookCover ? (
					<img
						src={getCoverPresetUrl(audiobookCover, coverPresets.thumbnail)}
						srcSet={getCoverSrcSet(
							audiobookCover,
							coverPresets.thumbnail.widths,
						)}
						sizes="80px"
						alt=""
						className="size-full object-cover"
						loading="lazy"
						decoding="async"
						width={160}
						height={160}
					/>
				) : (
					<Headphones className="size-7 text-muted-foreground" />
				)}
			</div>
		</div>
	);
}

function ReadListenResultRow({ pairing }: { pairing: ReadListenSearchResult }) {
	const title = pairing.audiobook.title;
	const authorText = formatNames(pairing.audiobook.authors);

	return (
		<li>
			<BookContextMenuTrigger
				bookUuid={pairing.audiobook.uuid}
				mediaType="audiobook"
				className="block"
			>
				<Link
					to="/dashboard/audiobooks/$uuid"
					params={{ uuid: pairing.audiobook.uuid }}
					preload="intent"
					className={rowClassName}
				>
					<ResultRowContent
						artwork={<ReadListenArtwork pairing={pairing} />}
						title={title}
						subtitle={authorText}
						meta={m["nav.read_listen"]()}
					/>
				</Link>
			</BookContextMenuTrigger>
		</li>
	);
}

function SearchPage() {
	const { q } = Route.useSearch();
	const normalizedQuery = q.trim();
	const shouldSearch = normalizedQuery.length >= SEARCH_MIN_QUERY_LENGTH;
	const { recent: recentSearches } = useRecentSearches();
	const router = useRouter();
	const [filterSnapshotKey] = useState(
		() => `${getLocationRestoreKey(router.latestLocation)}:search-filter`,
	);
	const [filter, setFilter] = useState<SearchTypeFilter>(
		() => readUiSnapshot<SearchTypeFilter>(filterSnapshotKey) ?? "all",
	);
	useOnUnmount(() => saveUiSnapshot(filterSnapshotKey, filter));
	const prevQueryRef = useRef(normalizedQuery);
	if (normalizedQuery !== prevQueryRef.current) {
		prevQueryRef.current = normalizedQuery;
		setFilter("all");
	}
	const isAll = filter === "all";
	const { data: topSearch, isLoading: isTopLoading } = useQuery({
		...orpc.search.top.queryOptions({
			input: { query: normalizedQuery, limit: SEARCH_TOP_RESULTS_LIMIT },
		}),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const { data: seriesData, isLoading: isSeriesLoading } = useQuery({
		queryKey: ["series", "search", normalizedQuery],
		queryFn: () => client.series.search({ query: normalizedQuery }),
		enabled: shouldSearch && filter === "series",
		staleTime: 60_000,
	});
	const { data: authorsData, isLoading: isAuthorsLoading } = useQuery({
		queryKey: ["authors", "search", normalizedQuery],
		queryFn: () => client.authors.search({ query: normalizedQuery }),
		enabled: shouldSearch && filter === "authors",
		staleTime: 60_000,
	});
	const { data: usersData, isLoading: isUsersLoading } = useQuery({
		queryKey: ["users", "search", normalizedQuery],
		queryFn: () => client.users.search({ query: normalizedQuery, limit: 10 }),
		enabled: shouldSearch && filter === "users",
		staleTime: 60_000,
	});
	const { data: collectionsData, isLoading: isCollectionsLoading } = useQuery({
		queryKey: ["collections", "search", normalizedQuery],
		queryFn: () =>
			client.collections.search({ query: normalizedQuery, limit: 20 }),
		enabled: shouldSearch && filter === "collections",
		staleTime: 60_000,
	});
	const { data: readListenPairings, isLoading: isReadListenLoading } = useQuery(
		{
			...orpc.readListen.searchPairings.queryOptions({
				input: { query: normalizedQuery, limit: 20 },
			}),
			enabled: shouldSearch && filter === "read-listen",
			staleTime: 60_000,
		},
	);
	const {
		data: booksData,
		isLoading: isBooksLoading,
		hasNextPage: booksHasNextPage,
		fetchNextPage: booksFetchNextPage,
		isFetchingNextPage: booksIsFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["books", "search", normalizedQuery],
		queryFn: ({ pageParam }) =>
			client.books.search({
				query: normalizedQuery || undefined,
				cursor: pageParam ?? undefined,
				limit: 30,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch && filter === "books",
		staleTime: 60_000,
	});
	const {
		data: audiobooksData,
		isLoading: isAudiobooksLoading,
		hasNextPage: audiobooksHasNextPage,
		fetchNextPage: audiobooksFetchNextPage,
		isFetchingNextPage: audiobooksIsFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["audiobooks", "search", normalizedQuery],
		queryFn: ({ pageParam }) =>
			client.audiobooks.search({
				query: normalizedQuery || undefined,
				cursor: pageParam ?? undefined,
				limit: 30,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (lastPage) => lastPage.pagination.cursor,
		enabled: shouldSearch && filter === "audiobooks",
		staleTime: 60_000,
	});

	const books = useMemo(
		() => booksData?.pages.flatMap((page) => page.books) ?? [],
		[booksData],
	);
	const audiobooks = useMemo(
		() => audiobooksData?.pages.flatMap((page) => page.audiobooks) ?? [],
		[audiobooksData],
	);
	const series = seriesData ?? [];
	const authors = authorsData ?? [];
	const users = usersData ?? [];
	const collections = collectionsData ?? [];
	const matchingReadListenPairings = useMemo(
		() =>
			(readListenPairings ?? []).filter((pairing) =>
				pairingMatchesQuery(pairing, normalizedQuery),
			),
		[readListenPairings, normalizedQuery],
	);
	const booksTotal = booksData?.pages[0]?.pagination.totalHits ?? books.length;
	const audiobooksTotal =
		audiobooksData?.pages[0]?.pagination.totalHits ?? audiobooks.length;
	const isSearchLoading =
		(filter === "all" && isTopLoading) ||
		(filter === "books" && isBooksLoading) ||
		(filter === "audiobooks" && isAudiobooksLoading) ||
		(filter === "read-listen" && isReadListenLoading) ||
		(filter === "series" && isSeriesLoading) ||
		(filter === "authors" && isAuthorsLoading) ||
		(filter === "collections" && isCollectionsLoading) ||
		(filter === "users" && isUsersLoading);
	const fetchMoreBooks = useCallback(() => {
		void booksFetchNextPage();
	}, [booksFetchNextPage]);
	const fetchMoreAudiobooks = useCallback(() => {
		void audiobooksFetchNextPage();
	}, [audiobooksFetchNextPage]);
	const resultCounts: Record<SearchTypeFilter, number> = {
		all: topSearch?.hits.length ?? 0,
		books: booksTotal,
		audiobooks: audiobooksTotal,
		"read-listen": matchingReadListenPairings.length,
		series: series.length,
		authors: authors.length,
		collections: collections.length,
		users: users.length,
	};
	const activeResultCount = resultCounts[filter];
	const hasNoResults =
		shouldSearch && !isSearchLoading && activeResultCount === 0;
	const statusMessage = !shouldSearch
		? ""
		: isSearchLoading
			? m["search.loading_results"]()
			: m["search.results_summary"]({
					count: activeResultCount,
					query: normalizedQuery,
				});

	const availableTypes = new Set(topSearch?.availableTypes);
	const filterOptions = [
		{ key: "all", label: m["search.all"](), resultType: null },
		{ key: "books", label: m["search.books"](), resultType: "book" },
		{
			key: "audiobooks",
			label: m["search.audiobooks"](),
			resultType: "audiobook",
		},
		{
			key: "read-listen",
			label: m["nav.read_listen"](),
			resultType: "read-listen",
		},
		{ key: "series", label: m["nav.series"](), resultType: "series" },
		{ key: "authors", label: m["search.authors"](), resultType: "author" },
		{
			key: "collections",
			label: m["search.collections"](),
			resultType: "collection",
		},
		{ key: "users", label: m["search.users"](), resultType: "user" },
	].filter(
		(option) =>
			option.resultType === null || availableTypes.has(option.resultType),
	);

	return (
		<div className={cn(PAGE_GUTTER, "mx-auto w-full py-6 md:py-8")}>
			<div className="space-y-8" aria-busy={isSearchLoading || undefined}>
				<p role="status" className="sr-only">
					{statusMessage}
				</p>
				<h1 className="sr-only">{m["search.results"]()}</h1>

				{shouldSearch && isSearchLoading ? (
					<FilterChipsSkeleton />
				) : shouldSearch ? (
					<div className="scrollbar-none -mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
						<fieldset className="flex w-max gap-2">
							<legend className="sr-only">
								{m["search.filter_results"]()}
							</legend>
							{filterOptions.map(({ key, label }) => (
								<button
									key={key}
									type="button"
									aria-pressed={filter === key}
									onClick={() => setFilter(key)}
									className={cn(
										"min-h-11 shrink-0 touch-manipulation whitespace-nowrap rounded-full px-4 font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.96] motion-safe:transition-[background-color,color,box-shadow,scale] motion-safe:duration-150",
										filter === key
											? "bg-foreground text-background shadow-sm"
											: "bg-accent text-foreground/80 shadow-[0_0_0_1px_oklch(0_0_0/0.06),0_1px_2px_oklch(0_0_0/0.04)] hover:bg-surface-accent-hover hover:text-foreground dark:shadow-[0_0_0_1px_oklch(1_0_0/0.08)]",
									)}
								>
									{label}
								</button>
							))}
						</fieldset>
					</div>
				) : null}

				{normalizedQuery && !shouldSearch && (
					<p className="text-muted-foreground text-sm">
						{m["search.type_at_least"]({
							count: SEARCH_MIN_QUERY_LENGTH,
						})}
					</p>
				)}

				{isAll &&
					(isTopLoading ? (
						<ResultListSkeleton />
					) : topSearch && topSearch.hits.length > 0 ? (
						<BookContextMenuRoot>
							<ul className="divide-y divide-border/60">
								{topSearch.hits.map((hit) => (
									<RankedResultRow key={searchResultKey(hit)} hit={hit} />
								))}
							</ul>
						</BookContextMenuRoot>
					) : null)}

				{filter === "books" &&
					(isBooksLoading ? (
						<ResultListSkeleton title={m["search.books"]()} />
					) : books.length > 0 ? (
						<ResultSection id="search-books" title={m["search.books"]()}>
							<BookContextMenuRoot>
								{books.map((book) => (
									<MediaResultRow
										key={book.uuid}
										uuid={book.uuid}
										title={book.title ?? null}
										filename={book.filename}
										cover={book.cover ?? null}
										authors={book.authors}
										mediaType="ebook"
									/>
								))}
							</BookContextMenuRoot>
						</ResultSection>
					) : null)}

				{filter === "books" && (
					<InfiniteResultsLoader
						hasNextPage={booksHasNextPage}
						isFetching={booksIsFetchingNextPage}
						onLoadMore={fetchMoreBooks}
					/>
				)}

				{filter === "audiobooks" &&
					(isAudiobooksLoading ? (
						<ResultListSkeleton title={m["search.audiobooks"]()} />
					) : audiobooks.length > 0 ? (
						<ResultSection
							id="search-audiobooks"
							title={m["search.audiobooks"]()}
						>
							<BookContextMenuRoot mediaType="audiobook">
								{audiobooks.map((audiobook) => (
									<MediaResultRow
										key={audiobook.uuid}
										uuid={audiobook.uuid}
										title={audiobook.title ?? null}
										filename={audiobook.filename}
										cover={audiobook.cover ?? null}
										authors={audiobook.authors}
										mediaType="audiobook"
									/>
								))}
							</BookContextMenuRoot>
						</ResultSection>
					) : null)}

				{filter === "audiobooks" && (
					<InfiniteResultsLoader
						hasNextPage={audiobooksHasNextPage}
						isFetching={audiobooksIsFetchingNextPage}
						onLoadMore={fetchMoreAudiobooks}
					/>
				)}

				{filter === "read-listen" &&
					(isReadListenLoading ? (
						<ResultListSkeleton title={m["nav.read_listen"]()} />
					) : matchingReadListenPairings.length > 0 ? (
						<ResultSection
							id="search-read-listen"
							title={m["nav.read_listen"]()}
						>
							<BookContextMenuRoot mediaType="audiobook">
								{matchingReadListenPairings.map((pairing) => (
									<ReadListenResultRow key={pairing.id} pairing={pairing} />
								))}
							</BookContextMenuRoot>
						</ResultSection>
					) : null)}

				{filter === "series" &&
					(isSeriesLoading ? (
						<ResultListSkeleton title={m["nav.series"]()} />
					) : series.length > 0 ? (
						<ResultSection id="search-series" title={m["nav.series"]()}>
							{series.map((entry) => (
								<li key={entry.uuid}>
									<Link
										to="/dashboard/series/$uuid"
										params={{ uuid: entry.uuid }}
										preload="intent"
										className={rowClassName}
									>
										<ResultRowContent
											artwork={<SeriesArtwork covers={entry.previewCovers} />}
											title={entry.name}
											subtitle={entry.author?.name}
											meta={m["media.book_count"]({
												count: entry.bookCount,
											})}
										/>
									</Link>
								</li>
							))}
						</ResultSection>
					) : null)}

				{filter === "authors" &&
					(isAuthorsLoading ? (
						<ResultListSkeleton title={m["search.authors"]()} />
					) : authors.length > 0 ? (
						<ResultSection id="search-authors" title={m["search.authors"]()}>
							{authors.map((author) => (
								<li key={author.uuid}>
									<Link
										to="/dashboard/authors/$uuid"
										params={{ uuid: author.uuid }}
										preload="intent"
										className={rowClassName}
									>
										<ResultRowContent
											artwork={<PortraitArtwork name={author.name} />}
											title={author.name}
											meta={m["media.book_count"]({
												count: author.bookCount,
											})}
										/>
									</Link>
								</li>
							))}
						</ResultSection>
					) : null)}

				{filter === "collections" &&
					(isCollectionsLoading ? (
						<ResultListSkeleton title={m["search.collections"]()} />
					) : collections.length > 0 ? (
						<ResultSection
							id="search-collections"
							title={m["search.collections"]()}
						>
							{collections.map((collection) => (
								<li key={collection.id}>
									<Link
										to="/dashboard/collections/$collectionId"
										params={{ collectionId: collection.id }}
										preload="intent"
										className={rowClassName}
									>
										<ResultRowContent
											artwork={
												<CoverArtwork
													cover={collection.previewCovers[0]}
													square
													fallback={
														<FolderSimple
															aria-hidden="true"
															className="size-7 text-muted-foreground"
														/>
													}
												/>
											}
											title={collection.name}
											subtitle={m["search.collection_by"]({
												username: collection.ownerUsername,
											})}
											meta={m["search.collections"]()}
										/>
									</Link>
								</li>
							))}
						</ResultSection>
					) : null)}

				{filter === "users" &&
					(isUsersLoading ? (
						<ResultListSkeleton title={m["search.users"]()} />
					) : users.length > 0 ? (
						<ResultSection id="search-users" title={m["search.users"]()}>
							{users.map((user) => (
								<li key={user.username}>
									<Link
										to="/dashboard/user/$username"
										params={{ username: user.username }}
										preload="intent"
										className={rowClassName}
									>
										<ResultRowContent
											artwork={
												<PortraitArtwork
													name={user.displayUsername ?? user.name}
													image={user.image}
												/>
											}
											title={user.displayUsername ?? user.name}
											subtitle={`@${user.username}`}
											meta={m["search.users"]()}
										/>
									</Link>
								</li>
							))}
						</ResultSection>
					) : null)}

				{hasNoResults && (
					<SearchEmptyState
						title={m["search.no_results_title"]({
							query: normalizedQuery,
						})}
						description={m["search.no_results_desc"]()}
					/>
				)}

				{!normalizedQuery &&
					(recentSearches.length > 0 ? (
						<section className="space-y-2" aria-labelledby="recent-searches">
							<h2
								id="recent-searches"
								className="scroll-mt-20 text-balance font-semibold text-xl leading-snug tracking-tight"
							>
								{m["search.recent_searches"]()}
							</h2>
							<ul className="divide-y divide-border/60">
								{recentSearches.map((term) => (
									<li key={term}>
										<Link
											to="/dashboard/search"
											search={{ q: term }}
											title={term}
											className={compactRowClassName}
										>
											<div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
												<Clock
													aria-hidden="true"
													className="size-5 text-muted-foreground"
												/>
											</div>
											<p className="min-w-0 flex-1 truncate font-medium">
												{term}
											</p>
											<CaretRight
												aria-hidden="true"
												className="size-4 text-muted-foreground rtl:-scale-x-100"
												weight="bold"
											/>
										</Link>
									</li>
								))}
							</ul>
						</section>
					) : (
						<SearchEmptyState
							title={m["search.empty_title"]()}
							description={m["search.empty_prompt"]()}
						/>
					))}
			</div>
		</div>
	);
}
