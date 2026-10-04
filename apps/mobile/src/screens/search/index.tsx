import type { TopHit } from "@nanahoshi/api/routers/search/search.model";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useScrollToTop } from "expo-router";
import { type ReactNode, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BookMenuTarget } from "@/components/book-menu";
import { ChipRow } from "@/components/chip";
import { Icon, icons } from "@/components/icon";
import {
	CoverArt,
	PortraitArt,
	ResultDivider,
	ResultRow,
	SeriesDeck,
} from "@/components/result-row";
import { SearchField } from "@/components/search-field";
import {
	EmptyState,
	ErrorState,
	RowSkeleton,
	Spinner,
} from "@/components/states";
import { Text } from "@/components/text";
import { joinNames, titleOrUntitled } from "@/lib/format";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { routes } from "@/lib/routes";
import {
	entryKey,
	type HistoryEntry,
	hitKey,
	useSearchHistory,
} from "@/lib/search-history";
import { usePrefetchTitle } from "@/lib/title-queries";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

type Filter =
	| "all"
	| "books"
	| "audiobooks"
	| "series"
	| "authors"
	| "narrators"
	| "collections";
type Hit = Exclude<TopHit, { type: "read-listen" } | { type: "user" }>;
const PAGE = 30;

const FILTERS: {
	key: Filter;
	label: () => string;
	type: TopHit["type"] | null;
}[] = [
	{ key: "all", label: () => t("search.all"), type: null },
	{ key: "books", label: () => t("search.books"), type: "book" },
	{ key: "audiobooks", label: () => t("search.audiobooks"), type: "audiobook" },
	{ key: "series", label: () => t("nav.series"), type: "series" },
	{ key: "authors", label: () => t("search.authors"), type: "author" },
	{ key: "narrators", label: () => t("nav.narrators"), type: "narrator" },
	{
		key: "collections",
		label: () => t("search.collections"),
		type: "collection",
	},
];

/** Reader-less hits (Read & Listen pairs) and people with no page on the
 * phone yet (users) stay out of the list. */
function isShown(hit: TopHit): hit is Hit {
	return hit.type !== "read-listen" && hit.type !== "user";
}

/** The web's /dashboard/search on a phone: the field, the type chips once a
 * query runs, ranked results as tall rows, and recent searches when empty. */
export function Search() {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc, client } = useApi();
	const insets = useSafeAreaInsets();
	const palette = usePalette();
	const listRef = useRef<FlashListRef<Hit>>(null);
	useScrollToTop(listRef);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<Filter>("all");
	const { history, addHit, addQuery, remove } = useSearchHistory();
	// Picking a recent query remounts the field with it as its text.
	const [field, setField] = useState({ key: 0, text: "" });
	const active = query.length > 0;

	const top = useQuery({
		...orpc.search.top.queryOptions({
			input: { query, limit: 20, pageSize: PAGE },
		}),
		enabled: active,
		staleTime: 60_000,
	});
	const books = useInfiniteQuery({
		queryKey: ["books", "search", query],
		queryFn: ({ pageParam }) =>
			client.books.search({
				query,
				cursor: pageParam,
				limit: PAGE,
				sort: "relevance",
				compact: true,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.pagination.cursor ?? undefined,
		enabled: active && (filter === "all" || filter === "books"),
		staleTime: 60_000,
	});
	const audiobooks = useInfiniteQuery({
		queryKey: ["audiobooks", "search", query],
		queryFn: ({ pageParam }) =>
			client.audiobooks.search({
				query,
				cursor: pageParam,
				limit: PAGE,
				sort: "relevance",
				compact: true,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.pagination.cursor ?? undefined,
		enabled: active && (filter === "all" || filter === "audiobooks"),
		staleTime: 60_000,
	});
	const series = useQuery({
		queryKey: ["series", "search", query],
		queryFn: () => client.series.search({ query, limit: 10 }),
		enabled: active && filter === "series",
		staleTime: 60_000,
	});
	const audioSeries = useQuery({
		queryKey: ["audiobook-series", "search", query],
		queryFn: () =>
			client.audiobooks.listSeries({ query, limit: 50, sort: "name" }),
		enabled: active && (filter === "series" || filter === "audiobooks"),
		staleTime: 60_000,
	});
	const authors = useQuery({
		queryKey: ["authors", "search", query],
		queryFn: () => client.authors.search({ query }),
		enabled: active && filter === "authors",
		staleTime: 60_000,
	});
	const narrators = useQuery({
		queryKey: ["narrators", "search", query],
		queryFn: () => client.narrators.list({ query, limit: 50, sort: "name" }),
		enabled: active && filter === "narrators",
		staleTime: 60_000,
	});
	const collections = useQuery({
		queryKey: ["collections", "search", query],
		queryFn: () => client.collections.search({ query, limit: 20 }),
		enabled: active && filter === "collections",
		staleTime: 60_000,
	});

	const audioSeriesHits: Hit[] = (audioSeries.data ?? []).map((entry) => ({
		...entry,
		type: "series",
		mediaType: "audiobook",
		bookCount: entry.audiobookCount,
		previewCovers: entry.cover ? [entry.cover] : [],
		author: null,
	}));

	const bookHits = (books.data?.pages.flatMap((page) => page.books) ?? []).map(
		(item): Hit => ({
			type: "book",
			uuid: item.uuid,
			title: item.title ?? null,
			filename: item.filename,
			cover: item.cover ?? null,
			authors: item.authors ?? [],
		}),
	);
	const audiobookHits = (
		audiobooks.data?.pages.flatMap((page) => page.audiobooks) ?? []
	).map(
		(item): Hit => ({
			type: "audiobook",
			uuid: item.uuid,
			title: item.title ?? null,
			filename: item.filename,
			cover: item.cover ?? null,
			authors: item.authors,
		}),
	);
	// "All" is the web's ranked list: the top hits first, then every other
	// matching book and audiobook page by page (interleaved), no repeats.
	const allHits: Hit[] = [];
	const seen = new Set<string>();
	const pushUnique = (hit: Hit) => {
		const key = hitKey(hit);
		if (seen.has(key)) return;
		seen.add(key);
		allHits.push(hit);
	};
	for (const hit of top.data?.hits ?? []) if (isShown(hit)) pushUnique(hit);
	for (
		let index = 0;
		index < Math.max(bookHits.length, audiobookHits.length);
		index++
	) {
		const book = bookHits[index];
		const audiobook = audiobookHits[index];
		if (book) pushUnique(book);
		if (audiobook) pushUnique(audiobook);
	}

	const sources = {
		all: { query: top, hits: allHits },
		books: {
			query: books,
			hits: (books.data?.pages.flatMap((page) => page.books) ?? []).map(
				(item): Hit => ({
					type: "book",
					uuid: item.uuid,
					title: item.title ?? null,
					filename: item.filename,
					cover: item.cover ?? null,
					authors: item.authors ?? [],
				}),
			),
		},
		audiobooks: {
			query: audiobooks,
			hits: [
				...audioSeriesHits,
				...(
					audiobooks.data?.pages.flatMap((page) => page.audiobooks) ?? []
				).map(
					(item): Hit => ({
						type: "audiobook",
						uuid: item.uuid,
						title: item.title ?? null,
						filename: item.filename,
						cover: item.cover ?? null,
						authors: item.authors,
					}),
				),
			],
		},
		series: {
			query: series,
			hits: [
				...(series.data ?? []).map(
					(entry): Hit => ({ ...entry, type: "series", mediaType: "ebook" }),
				),
				...audioSeriesHits,
			],
		},
		authors: {
			query: authors,
			hits: (authors.data ?? []).map(
				(entry): Hit => ({ ...entry, type: "author" }),
			),
		},
		narrators: {
			query: narrators,
			hits: (narrators.data ?? []).map(
				(entry): Hit => ({ ...entry, type: "narrator" }),
			),
		},
		collections: {
			query: collections,
			hits: (collections.data ?? []).map(
				(entry): Hit => ({ ...entry, type: "collection" }),
			),
		},
	} as const;
	const current = sources[filter];
	const paged =
		filter === "books" ? books : filter === "audiobooks" ? audiobooks : null;
	const loadMore = () => {
		if (filter === "all") {
			if (books.hasNextPage && !books.isFetchingNextPage)
				void books.fetchNextPage();
			if (audiobooks.hasNextPage && !audiobooks.isFetchingNextPage)
				void audiobooks.fetchNextPage();
		} else if (paged?.hasNextPage && !paged.isFetchingNextPage)
			void paged.fetchNextPage();
	};

	const available = new Set(top.data?.availableTypes);
	const chips = FILTERS.filter(
		(option) => option.type === null || available.has(option.type),
	).map((option) => ({
		value: option.key,
		label: option.label(),
	}));

	const onQuery = (next: string) => {
		setQuery(next);
		setFilter("all");
	};

	return (
		<View style={{ flex: 1 }}>
			{/* Pinned like the Play Store's field: results scroll beneath it and
			    never carry it up under the status bar. */}
			<View
				style={{
					gap: space.lg,
					paddingTop:
						(process.env.EXPO_OS === "ios" ? 0 : insets.top) + space.md,
					paddingBottom: space.md,
					backgroundColor: palette.background,
				}}
			>
				<View style={{ paddingHorizontal: space.lg }}>
					<SearchField
						key={field.key}
						defaultValue={field.text}
						placeholder={t("search.placeholder")}
						onQuery={onQuery}
						onSubmit={addQuery}
					/>
				</View>
				{active && chips.length > 1 ? (
					<ChipRow value={filter} onChange={setFilter} options={chips} />
				) : null}
			</View>
			<FlashList
				ref={listRef}
				contentInsetAdjustmentBehavior={
					process.env.EXPO_OS === "ios" ? "never" : "automatic"
				}
				data={active ? current.hits : []}
				keyExtractor={hitKey}
				getItemType={(hit) => hit.type}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				contentContainerStyle={{
					paddingHorizontal: space.xs,
					paddingBottom: space.xxl + miniPlayerInset,
				}}
				ItemSeparatorComponent={ResultDivider}
				onEndReachedThreshold={0.6}
				onEndReached={loadMore}
				ListEmptyComponent={
					!active ? (
						<Recents
							history={history}
							onPick={(entry) => {
								if (entry.kind === "hit") {
									addHit(entry.hit);
									return;
								}
								addQuery(entry.query);
								setField((prev) => ({ key: prev.key + 1, text: entry.query }));
								onQuery(entry.query);
							}}
							onRemove={remove}
						/>
					) : current.query.isError ? (
						<ErrorState onRetry={() => void current.query.refetch()} />
					) : current.query.isPending ? (
						<RowSkeleton count={6} />
					) : (
						<EmptyState
							icon={icons.search}
							title={t("search.no_results_title", { query })}
							message={t("search.no_results_desc")}
						/>
					)
				}
				ListFooterComponent={
					books.isFetchingNextPage || audiobooks.isFetchingNextPage ? (
						<Spinner />
					) : null
				}
				renderItem={({ item }) => (
					<HitRow hit={item} onSelect={() => addHit(item)} />
				)}
			/>
		</View>
	);
}

function HitRow({
	hit,
	onSelect,
	trailing,
}: {
	hit: Hit;
	onSelect?: () => void;
	trailing?: ReactNode;
}) {
	const prefetch = usePrefetchTitle();
	const common = { onPress: onSelect, trailing };
	switch (hit.type) {
		case "book":
		case "audiobook": {
			const audio = hit.type === "audiobook";
			return (
				<BookMenuTarget
					target={{
						uuid: hit.uuid,
						kind: audio ? "audiobook" : "book",
						title: hit.title ?? hit.filename,
						cover: hit.cover,
						subtitle: joinNames(hit.authors),
					}}
				>
					{(onLongPress) => (
						<ResultRow
							{...common}
							href={routes.title(audio ? "audiobook" : "book", hit.uuid)}
							onPressIn={() =>
								prefetch(audio ? "audiobook" : "book", hit.uuid, hit.cover)
							}
							onLongPress={onLongPress}
							artwork={
								<CoverArt
									cover={hit.cover}
									square={audio}
									fallback={audio ? icons.headphones : icons.book}
									recyclingKey={hit.uuid}
								/>
							}
							title={hit.title ?? titleOrUntitled(hit.filename)}
							subtitle={joinNames(hit.authors)}
							meta={t(audio ? "media.audiobook" : "media.book")}
						/>
					)}
				</BookMenuTarget>
			);
		}
		case "series": {
			const audio = hit.mediaType === "audiobook";
			return (
				<ResultRow
					{...common}
					href={routes.series(hit.uuid, audio ? "audiobook" : "book")}
					artwork={
						audio ? (
							<CoverArt cover={hit.cover} square fallback={icons.headphones} />
						) : (
							<SeriesDeck covers={hit.previewCovers} />
						)
					}
					title={hit.name}
					subtitle={hit.author?.name}
					meta={`${t("nav.series")} · ${t(audio ? "media.audiobook_count" : "media.book_count", { count: hit.bookCount })}`}
				/>
			);
		}
		case "author":
			return (
				<ResultRow
					{...common}
					href={routes.author(hit.uuid)}
					artwork={<PortraitArt />}
					title={hit.name}
					meta={`${t("common.author")} · ${t("media.book_count", { count: hit.bookCount })}`}
				/>
			);
		case "narrator":
			return (
				<ResultRow
					{...common}
					href={routes.narrator(hit.uuid)}
					artwork={<PortraitArt icon={icons.narrator} />}
					title={hit.name}
					meta={`${t("nav.narrators")} · ${t("media.audiobook_count", { count: hit.audiobookCount })}`}
				/>
			);
		case "collection":
			return (
				<ResultRow
					{...common}
					href={routes.collection(hit.id)}
					artwork={
						<CoverArt
							cover={hit.previewCovers[0]}
							square
							fallback={icons.collection}
						/>
					}
					title={hit.name}
					subtitle={t("search.collection_by", {
						username: hit.ownerUsername ?? "",
					})}
					meta={t("search.collections")}
				/>
			);
	}
}

function Recents({
	history,
	onPick,
	onRemove,
}: {
	history: HistoryEntry[];
	onPick: (entry: HistoryEntry) => void;
	onRemove: (entry: HistoryEntry) => void;
}) {
	const palette = usePalette();
	const entries = history.filter(
		(entry) => entry.kind === "query" || isShown(entry.hit),
	);
	if (entries.length === 0) {
		return (
			<EmptyState
				icon={icons.search}
				title={t("search.empty_title")}
				message={t("search.empty_prompt")}
			/>
		);
	}
	return (
		<View style={{ gap: space.xs }}>
			<Text
				variant="section"
				accessibilityRole="header"
				style={{
					paddingHorizontal: space.md,
					paddingTop: space.sm,
					paddingBottom: space.xs,
				}}
			>
				{t("search.recent_searches")}
			</Text>
			{entries.map((entry, index) => {
				const label =
					entry.kind === "query"
						? entry.query
						: "name" in entry.hit
							? entry.hit.name
							: "title" in entry.hit
								? (entry.hit.title ?? "")
								: "";
				const remove = (
					<Pressable
						android_ripple={{ color: palette.ripple }}
						onPress={() => onRemove(entry)}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={t("search.remove_recent", { query: label })}
						style={({ pressed }) => ({
							width: 36,
							height: 36,
							borderRadius: 18,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor:
								pressed && !IS_ANDROID ? palette.surface : "transparent",
						})}
					>
						<Icon name={icons.close} size={16} color={palette.textSecondary} />
					</Pressable>
				);
				return (
					<View key={entryKey(entry)}>
						{index > 0 ? <ResultDivider /> : null}
						{entry.kind === "query" ? (
							<ResultRow
								compact
								artwork={
									<Icon
										name={icons.clock}
										size={22}
										color={palette.textSecondary}
									/>
								}
								title={entry.query}
								onPress={() => onPick(entry)}
								trailing={remove}
							/>
						) : isShown(entry.hit) ? (
							<HitRow
								hit={entry.hit}
								onSelect={() => onPick(entry)}
								trailing={remove}
							/>
						) : null}
					</View>
				);
			})}
		</View>
	);
}
