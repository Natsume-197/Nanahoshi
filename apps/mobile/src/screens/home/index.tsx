import type { RecommendationItem } from "@nanahoshi/api/routers/recommendations/recommendations.model";
import { useQuery } from "@tanstack/react-query";
import { useScrollToTop } from "expo-router";
import { useRef, useState } from "react";
import {
	FlatList,
	type RefreshControlProps,
	ScrollView,
	useWindowDimensions,
	View,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChipRow } from "@/components/chip";
import { CollectionCard } from "@/components/collection-card";
import {
	HomeAppBar,
	useAppBarHeight,
	useAppBarScroll,
} from "@/components/home-app-bar";
import { icons } from "@/components/icon";
import { RefreshControl } from "@/components/refresh-control";
import { SectionHeader } from "@/components/section-header";
import { Shelf } from "@/components/shelf";
import { Bone, ShelfSkeleton, SkeletonPulse } from "@/components/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import type { TileItem } from "@/components/title-tile";
import { OfflineBanner } from "@/downloads/offline-banner";
import { useIsOnline } from "@/downloads/provider";
import { useCan } from "@/lib/abilities";
import { joinNames, percent } from "@/lib/format";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { setupSteps } from "@/lib/setup-flow";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { radius, sizes, space } from "@/theme";
import {
	ContinueCard,
	type ContinueItem,
	ContinueSkeleton,
} from "./continue-card";
import { SeriesShelf } from "./series-shelf";
import { SetupChecklist } from "./setup-checklist";

type Category = "home" | "books" | "audiobooks";
type Format = "all" | "books" | "audiobooks";
const LIMIT = 20;
const COLLECTION_CARD_WIDTH = 168;

/**
 * The web's DashboardCategoryContent on a phone: Inicio / Libros /
 * Audiolibros (only the formats this server has), then the same sections in
 * the same default order as the web home layout.
 */
export function Home() {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc } = useApi();
	const insets = useSafeAreaInsets();
	const scrollRef = useRef<ScrollView>(null);
	// Re-tapping Home scrolls back up, as every native tab does.
	useScrollToTop(scrollRef);
	const [picked, setPicked] = useState<Category>("home");
	const libraries = useQuery(orpc.libraries.getLibraries.queryOptions());
	const hasBooks =
		libraries.data?.some((library) => library.mediaType === "ebook") ?? false;
	const hasAudio =
		libraries.data?.some((library) => library.mediaType === "audiobook") ??
		false;
	const categories = [
		{ value: "home" as const, label: t("nav.home") },
		...(hasBooks ? [{ value: "books" as const, label: t("nav.books") }] : []),
		...(hasAudio
			? [{ value: "audiobooks" as const, label: t("nav.audiobooks") }]
			: []),
	];
	const category = categories.some((option) => option.value === picked)
		? picked
		: "home";
	const [refreshKey, setRefreshKey] = useState(0);
	const appBarHeight = useAppBarHeight();

	const refreshControl = (
		<RefreshControl
			// Android: the spinner drops in below the app bar, not behind it.
			progressViewOffset={insets.top + appBarHeight}
			onRefresh={async () => {
				await libraries.refetch();
				setRefreshKey((key) => key + 1);
			}}
		/>
	);
	// No network, or a server that doesn't answer: downloads still open.
	const offline = !useIsOnline() || libraries.isError;
	const content = (
		<>
			{offline ? <OfflineBanner /> : null}
			{libraries.isPending ? (
				<ChipRowSkeleton />
			) : categories.length > 1 ? (
				<View style={{ paddingTop: 20, paddingBottom: space.sm }}>
					<ChipRow value={category} onChange={setPicked} options={categories} />
				</View>
			) : null}
			<View style={{ paddingTop: space.md }}>
				{category === "home" ? (
					<HomeSections key={`home-${refreshKey}`} />
				) : (
					<CategorySections
						key={`${category}-${refreshKey}`}
						format={category}
					/>
				)}
			</View>
		</>
	);

	if (process.env.EXPO_OS === "ios")
		return (
			<ScrollView
				ref={scrollRef}
				contentInsetAdjustmentBehavior="never"
				contentContainerStyle={{ paddingBottom: space.xxl + miniPlayerInset }}
				refreshControl={refreshControl}
			>
				{content}
			</ScrollView>
		);
	// Android: the server / friends / notifications bar lives on Home only;
	// the other tabs open straight onto their own title.
	return (
		<AndroidHome scrollRef={scrollRef} refreshControl={refreshControl}>
			{content}
		</AndroidHome>
	);
}

function AndroidHome({
	scrollRef,
	refreshControl,
	children,
}: {
	scrollRef: React.RefObject<ScrollView | null>;
	refreshControl: React.ReactElement<RefreshControlProps>;
	children: React.ReactNode;
}) {
	const insets = useSafeAreaInsets();
	const appBar = useAppBarScroll();
	const miniPlayerInset = useMiniPlayerInset();
	return (
		<View style={{ flex: 1 }}>
			<Animated.ScrollView
				ref={scrollRef}
				onScroll={appBar.onScroll}
				scrollEventThrottle={16}
				contentContainerStyle={{
					paddingTop: insets.top + appBar.height,
					paddingBottom: space.xxl + miniPlayerInset,
				}}
				refreshControl={refreshControl}
			>
				{children}
			</Animated.ScrollView>
			<HomeAppBar scroll={appBar} />
		</View>
	);
}

/** The category chips' row while the libraries (and so the formats) load. */
function ChipRowSkeleton() {
	return (
		<View style={{ paddingTop: 20, paddingBottom: space.sm }}>
			<SkeletonPulse>
				<View
					style={{
						flexDirection: "row",
						gap: space.md,
						paddingHorizontal: space.lg,
					}}
				>
					{[72, 76, 112].map((width) => (
						<Bone
							key={width}
							width={width}
							height={sizes.chip}
							radius={radius.field}
						/>
					))}
				</View>
			</SkeletonPulse>
		</View>
	);
}

function Stack({ children }: { children: React.ReactNode }) {
	return <View style={{ gap: space.xxl }}>{children}</View>;
}

/** Default web home layout (lib/home-layout-store.ts HOME_SECTION_IDS). */
function HomeSections() {
	const { orpc } = useApi();
	const probe = useQuery(
		orpc.books.listRecent.queryOptions({ input: { limit: 1 } }),
	);
	if (probe.isError) return <ErrorState onRetry={() => probe.refetch()} />;
	return (
		<Stack>
			<ContinueSection format="all" />
			<RecentlyAddedSection format="all" />
			<RecommendationsSection format="books" />
			<RecommendationsSection format="audiobooks" />
			<PopularSection format="all" />
			<DiscoverCollectionsSection />
			<YourCollectionsSection />
			<BookSeriesSection />
			<AudiobookSeriesSection />
			<RandomSection format="books" />
			<RandomSection format="audiobooks" />
			<EmptyHomeNotice />
		</Stack>
	);
}

/** The web's MediaCategoryContent. */
function CategorySections({ format }: { format: "books" | "audiobooks" }) {
	return (
		<Stack>
			<ContinueSection format={format} />
			<RecentlyAddedSection format={format} />
			<RecommendationsSection format={format} />
			<PopularSection format={format} />
			{format === "books" ? <BookSeriesSection /> : <AudiobookSeriesSection />}
			<RandomSection format={format} />
		</Stack>
	);
}

function ContinueSection({ format }: { format: Format }) {
	const { orpc } = useApi();
	const width = Math.min(360, useWindowDimensions().width - space.lg * 2 - 24);
	const reading = useQuery({
		...orpc.readingProgress.listInProgress.queryOptions({
			input: { limit: LIMIT },
		}),
		enabled: format !== "audiobooks",
	});
	const listening = useQuery({
		...orpc.listeningProgress.listInProgress.queryOptions({
			input: { limit: LIMIT },
		}),
		enabled: format !== "books",
	});

	const items: ContinueItem[] = [
		...(format === "audiobooks" ? [] : (reading.data ?? [])).map((entry) => ({
			uuid: entry.bookUuid,
			kind: "book" as const,
			title: entry.title,
			cover: entry.cover,
			color: entry.mainColor,
			authors: joinNames(entry.authors),
			progress: percent(entry.exploredCharCount, entry.bookCharCount),
			lastActivity: entry.lastReadAt,
		})),
		...(format === "books" ? [] : (listening.data ?? [])).map((entry) => {
			const duration =
				entry.durationSeconds && entry.durationSeconds > 0
					? entry.durationSeconds
					: entry.duration;
			return {
				uuid: entry.bookUuid,
				kind: "audiobook" as const,
				title: entry.title,
				cover: entry.cover,
				color: entry.mainColor,
				authors: joinNames(entry.authors),
				progress: percent(entry.currentTimeSeconds, duration),
				lastActivity: entry.lastListenedAt,
			};
		}),
	]
		.sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""))
		.slice(0, LIMIT);

	const loading =
		(format !== "audiobooks" && reading.isPending) ||
		(format !== "books" && listening.isPending);
	if (items.length === 0 && !loading) return null;
	const title =
		format === "books"
			? t("home.continue_reading")
			: format === "audiobooks"
				? t("home.continue_listening")
				: t("home.hero_continue");

	return (
		<View style={{ gap: space.lg }}>
			<SectionHeader title={title} />
			{items.length === 0 ? (
				<ContinueSkeleton width={width} />
			) : (
				<FlatList
					horizontal
					data={items}
					keyExtractor={(item) => `${item.kind}:${item.uuid}`}
					renderItem={({ item }) => <ContinueCard item={item} width={width} />}
					showsHorizontalScrollIndicator={false}
					snapToInterval={width + space.lg}
					decelerationRate="fast"
					contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}
				/>
			)}
		</View>
	);
}

function RecentlyAddedSection({ format }: { format: Format }) {
	const { orpc } = useApi();
	const books = useQuery({
		...orpc.books.listRecent.queryOptions({
			input: { limit: LIMIT, compact: true },
		}),
		enabled: format !== "audiobooks",
	});
	const audiobooks = useQuery({
		...orpc.audiobooks.listRecent.queryOptions({
			input: { limit: LIMIT, compact: true },
		}),
		enabled: format !== "books",
	});
	const loading =
		(format !== "audiobooks" && books.isPending) ||
		(format !== "books" && audiobooks.isPending);
	const items = [
		...(format === "audiobooks" ? [] : (books.data ?? [])).map((book) => ({
			createdAt: book.createdAt,
			tile: {
				uuid: book.uuid,
				kind: "book",
				title: book.title,
				cover: book.cover,
				color: book.mainColor,
				subtitle: joinNames(book.authors),
			} satisfies TileItem,
		})),
		...(format === "books" ? [] : (audiobooks.data ?? [])).map((book) => ({
			createdAt: book.createdAt,
			tile: {
				uuid: book.uuid,
				kind: "audiobook",
				title: book.title,
				cover: book.cover,
				color: book.mainColor,
				subtitle: joinNames(book.authors),
			} satisfies TileItem,
		})),
	]
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.slice(0, LIMIT)
		.map((entry) => entry.tile);

	return (
		<Shelf
			title={t("home.recently_added")}
			href={{
				pathname: "/catalog",
				params: { format: format === "audiobooks" ? "audiobook" : "ebook" },
			}}
			loading={loading}
			audio={format === "audiobooks"}
			items={items}
		/>
	);
}

function toTile(item: RecommendationItem): TileItem {
	return {
		uuid: item.book.uuid,
		kind: item.book.mediaType === "audiobook" ? "audiobook" : "book",
		title: item.book.title,
		cover: item.book.cover,
		color: item.book.mainColor,
		subtitle: joinNames(item.book.authors),
	};
}

/** The web's mergeRecommendationMixes: round-robin across mixes, personal
 * picks first, popularity filler last, no duplicates. */
function mergeMixes(mixes: { items: RecommendationItem[] }[], limit: number) {
	const result: RecommendationItem[] = [];
	const seen = new Set<string>();
	const pass = (accept: (item: RecommendationItem) => boolean) => {
		const longest = Math.max(0, ...mixes.map((mix) => mix.items.length));
		for (let rank = 0; rank < longest && result.length < limit; rank++) {
			for (const mix of mixes) {
				const item = mix.items[rank];
				if (!item || !accept(item) || seen.has(item.book.uuid)) continue;
				seen.add(item.book.uuid);
				result.push(item);
				if (result.length >= limit) break;
			}
		}
	};
	pass((item) => item.reason.type !== "popular");
	pass((item) => item.reason.type === "popular");
	return result;
}

function RecommendationsSection({
	format,
}: {
	format: "books" | "audiobooks";
}) {
	const { orpc } = useApi();
	const recs = useQuery({
		...orpc.recommendations.forUser.queryOptions({
			input: { format, perMixLimit: LIMIT },
		}),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const title =
		format === "books" ? t("recs.books_for_you") : t("recs.audiobooks_for_you");
	if (recs.isPending)
		return (
			<Shelf
				title={title}
				items={undefined}
				loading
				audio={format === "audiobooks"}
			/>
		);
	if (!recs.data?.enabled) return null;
	const items = mergeMixes(recs.data.mixes, LIMIT);
	// Cold start: the server answers with popularity, which has its own row.
	if (
		items.length === 0 ||
		items.every((item) => item.reason.type === "popular")
	)
		return null;
	return (
		<Shelf
			title={title}
			items={items.map((item) => ({ ...toTile(item), recommendation: true }))}
		/>
	);
}

function PopularSection({ format }: { format: Format }) {
	const { orpc } = useApi();
	const popular = useQuery(
		orpc.recommendations.popular.queryOptions({
			input: { format, limit: LIMIT },
		}),
	);
	const title =
		format === "books"
			? t("recs.mix_popular_books")
			: format === "audiobooks"
				? t("recs.mix_popular_audiobooks")
				: t("recs.mix_popular");
	if (popular.isPending)
		return (
			<Shelf
				title={title}
				items={undefined}
				loading
				audio={format === "audiobooks"}
			/>
		);
	if (!popular.data?.enabled || popular.data.items.length === 0) return null;
	return <Shelf title={title} items={popular.data.items.map(toTile)} />;
}

function CollectionsRail({
	title,
	href,
	collections,
	loading,
}: {
	loading?: boolean;
	title: string;
	href?: Parameters<typeof SectionHeader>[0]["href"];
	collections: {
		id: string;
		name: string;
		previewCovers: string[];
		bookCount: number | null;
	}[];
}) {
	if (collections.length === 0 && !loading) return null;
	return (
		<View style={{ gap: space.lg }}>
			<SectionHeader title={title} href={href} />
			{collections.length === 0 ? (
				<ShelfSkeleton width={COLLECTION_CARD_WIDTH} shape="collection" />
			) : (
				<FlatList
					horizontal
					data={collections}
					keyExtractor={(item) => item.id}
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}
					renderItem={({ item }) => (
						<CollectionCard
							href={routes.collection(item.id)}
							name={item.name}
							covers={item.previewCovers}
							width={COLLECTION_CARD_WIDTH}
							subtitle={
								item.bookCount == null
									? "…"
									: t("media.item_count", { count: item.bookCount })
							}
						/>
					)}
				/>
			)}
		</View>
	);
}

function DiscoverCollectionsSection() {
	const { orpc } = useApi();
	const discover = useQuery(
		orpc.collections.discover.queryOptions({ input: { limit: LIMIT } }),
	);
	return (
		<CollectionsRail
			title={t("home.discover_collections")}
			collections={discover.data ?? []}
			loading={discover.isPending}
		/>
	);
}

function YourCollectionsSection() {
	const { orpc } = useApi();
	const collections = useQuery({
		...orpc.collections.list.queryOptions(),
		staleTime: 30_000,
	});
	const visible = (collections.data ?? []).filter(
		(collection) =>
			collection.kind === "dynamic" ||
			collection.bookCount == null ||
			collection.bookCount > 0,
	);
	return (
		<CollectionsRail
			title={t("home.your_collections")}
			href="/collections"
			collections={visible}
			loading={collections.isPending}
		/>
	);
}

function BookSeriesSection() {
	const { orpc } = useApi();
	const series = useQuery(
		orpc.series.list.queryOptions({ input: { limit: LIMIT, sort: "recent" } }),
	);
	return (
		<SeriesShelf
			title={t("home.book_series")}
			kind="book"
			loading={series.isPending}
			items={series.data?.map((item) => ({
				uuid: item.uuid,
				name: item.name,
				cover: item.cover,
				color: item.coverColor,
				subtitle: t("home.series_book_count", { count: item.bookCount }),
			}))}
		/>
	);
}

function AudiobookSeriesSection() {
	const { orpc } = useApi();
	const series = useQuery(
		orpc.audiobooks.listSeries.queryOptions({
			input: { limit: LIMIT, sort: "recent" },
		}),
	);
	return (
		<SeriesShelf
			title={t("home.audiobook_series")}
			kind="audiobook"
			loading={series.isPending}
			items={series.data?.map((item) => ({
				uuid: item.uuid,
				name: item.name,
				cover: item.cover,
				color: item.coverColor,
				subtitle: t("home.series_audiobook_count", {
					count: item.audiobookCount,
				}),
			}))}
		/>
	);
}

function RandomSection({ format }: { format: "books" | "audiobooks" }) {
	const { orpc } = useApi();
	const books = useQuery({
		...orpc.books.listRandom.queryOptions({ input: { limit: LIMIT } }),
		enabled: format === "books",
	});
	const audiobooks = useQuery({
		...orpc.audiobooks.listRandom.queryOptions({ input: { limit: LIMIT } }),
		enabled: format === "audiobooks",
	});
	const items: TileItem[] | undefined =
		format === "books"
			? books.data?.map((book) => ({
					uuid: book.uuid,
					kind: "book",
					title: book.title,
					cover: book.cover,
					color: book.mainColor,
					subtitle: joinNames(book.authors),
				}))
			: audiobooks.data?.map((book) => ({
					uuid: book.uuid,
					kind: "audiobook",
					title: book.title,
					cover: book.cover,
					color: book.mainColor,
					subtitle: joinNames(book.authors),
				}));
	return (
		<Shelf
			title={
				format === "books"
					? t("home.random_books")
					: t("home.random_audiobooks")
			}
			items={items}
			loading={format === "books" ? books.isPending : audiobooks.isPending}
			audio={format === "audiobooks"}
		/>
	);
}

/** Nothing imported yet: the web's member-facing empty library notice. */
function EmptyHomeNotice() {
	const { orpc } = useApi();
	const books = useQuery(
		orpc.books.listRecent.queryOptions({
			input: { limit: LIMIT, compact: true },
		}),
	);
	const audiobooks = useQuery(
		orpc.audiobooks.listRecent.queryOptions({
			input: { limit: LIMIT, compact: true },
		}),
	);
	const libraries = useQuery(orpc.libraries.getLibraries.queryOptions());
	const can = useCan();
	if (books.isPending || audiobooks.isPending || libraries.isPending)
		return null;
	const titleCount = (books.data?.length ?? 0) + (audiobooks.data?.length ?? 0);
	if (titleCount > 0) return null;
	// Someone who can fill the server gets walked through it instead.
	const steps = setupSteps({
		canCreateLibrary: can("library", "create"),
		canUpload: can("library", "upload"),
		libraryCount: libraries.data?.length ?? 0,
		titleCount,
	});
	if (steps) return <SetupChecklist steps={steps} />;
	return (
		<EmptyState
			icon={icons.shelf}
			title={t("home.no_books_title")}
			message={t("home.empty_member")}
		/>
	);
}
