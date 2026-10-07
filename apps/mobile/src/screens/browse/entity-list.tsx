import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { Cover } from "@/components/cover";
import { Icon, type IconName, icons } from "@/components/icon";
import { MediaRow } from "@/components/media-row";
import { Monogram } from "@/components/monogram";
import { PressableLink } from "@/components/pressable-link";
import { RefreshControl } from "@/components/refresh-control";
import { SearchField } from "@/components/search-field";
import {
	EmptyState,
	ErrorState,
	OfflineState,
	RowSkeleton,
	Spinner,
	waitingOffline,
} from "@/components/states";
import { Text } from "@/components/text";
import { useGridTileWidth } from "@/hooks/use-grid-tile-width";
import { mutedAccentSurface } from "@/lib/color";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { COVER_ASPECT, radius, space, usePalette } from "@/theme";

export type EntityKind = "authors" | "narrators" | "publishers" | "genres";
const PAGE = 40;
/** The web's GenreTile, sized for a phone: two columns at least, so the
 * plate is squarer than the web's 2:1 and the padding tighter. */
const GENRE_ASPECT = 1.5;
const GENRE_MIN_WIDTH = 160;
const GENRE_GAP = 12;
const GENRE_INSET = 10;
const GENRE_PADDING = 14;
const GENRE_ARTWORK_SHARE = 0.34;

function capitalizeFirst(value: string) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

type Row = {
	uuid: string;
	name: string;
	count: number;
	cover?: string | null;
	square?: boolean;
	color?: string | null;
};

const META: Record<EntityKind, { icon: IconName; placeholderKey: string }> = {
	authors: { icon: icons.author, placeholderKey: "nav.authors" },
	narrators: { icon: icons.narrator, placeholderKey: "nav.narrators" },
	publishers: { icon: icons.publisher, placeholderKey: "nav.publishers" },
	genres: { icon: icons.genre, placeholderKey: "nav.genres" },
};

/** Authors, narrators, publishers and genres share one screen: a filter
 * field and a paged list of rows, alphabetical. */
export function EntityList({ kind }: { kind: EntityKind }) {
	const miniPlayerInset = useMiniPlayerInset();
	const { orpc } = useApi();
	const [query, setQuery] = useState("");
	const input = (cursor: number) => ({
		sort: "name" as const,
		cursor,
		limit: PAGE,
		query: query || undefined,
	});
	const next = (last: unknown[], pages: unknown[][]) =>
		last.length === PAGE ? pages.length * PAGE : undefined;

	const authors = useInfiniteQuery({
		...orpc.authors.list.infiniteOptions({
			input,
			initialPageParam: 0,
			getNextPageParam: next,
		}),
		enabled: kind === "authors",
	});
	const narrators = useInfiniteQuery({
		...orpc.narrators.list.infiniteOptions({
			input,
			initialPageParam: 0,
			getNextPageParam: next,
		}),
		enabled: kind === "narrators",
	});
	const publishers = useInfiniteQuery({
		...orpc.publishers.list.infiniteOptions({
			input,
			initialPageParam: 0,
			getNextPageParam: next,
		}),
		enabled: kind === "publishers",
	});
	const genres = useInfiniteQuery({
		...orpc.genres.list.infiniteOptions({
			input,
			initialPageParam: 0,
			getNextPageParam: next,
		}),
		enabled: kind === "genres",
	});

	// People are a grid of portraits on the web (authors/narrators index),
	// genres wide tinted tiles; publishers stay rows with their cover.
	const people = kind === "authors" || kind === "narrators";
	const tiles = kind === "genres";
	const tileWidth = useGridTileWidth(2, space.lg);
	const { width: screenWidth } = useWindowDimensions();
	const genreColumns = Math.max(
		2,
		Math.floor(
			(screenWidth - space.lg * 2 + GENRE_GAP) / (GENRE_MIN_WIDTH + GENRE_GAP),
		),
	);
	const genreWidth =
		(screenWidth - space.lg * 2 - GENRE_GAP * (genreColumns - 1)) /
		genreColumns;
	const active = { authors, narrators, publishers, genres }[kind];
	const rows: Row[] =
		kind === "authors"
			? (authors.data?.pages.flat() ?? []).map((row) => ({
					uuid: row.uuid,
					name: row.name,
					count: row.bookCount,
				}))
			: kind === "narrators"
				? (narrators.data?.pages.flat() ?? []).map((row) => ({
						uuid: row.uuid,
						name: row.name,
						count: row.audiobookCount,
					}))
				: kind === "publishers"
					? (publishers.data?.pages.flat() ?? []).map((row) => ({
							uuid: row.uuid,
							name: row.name,
							count: row.bookCount,
							cover: row.cover,
						}))
					: (genres.data?.pages.flat() ?? []).map((row) => ({
							uuid: row.uuid,
							name: row.name,
							count: row.bookCount,
							cover: row.cover,
							square: row.square,
							color: row.mainColor,
						}));

	const hrefFor = (row: Row): Href =>
		kind === "authors"
			? routes.author(row.uuid)
			: kind === "narrators"
				? {
						pathname: "/narrator/[uuid]",
						params: { uuid: row.uuid, name: row.name },
					}
				: kind === "publishers"
					? {
							pathname: "/publisher/[uuid]",
							params: { uuid: row.uuid, name: row.name },
						}
					: {
							pathname: "/genre/[uuid]",
							params: { uuid: row.uuid, name: row.name },
						};

	return (
		<FlashList
			showsVerticalScrollIndicator={false}
			data={rows}
			key={people ? "grid" : tiles ? `tiles-${genreColumns}` : "rows"}
			numColumns={people ? 2 : tiles ? genreColumns : 1}
			contentInsetAdjustmentBehavior="automatic"
			keyboardDismissMode="on-drag"
			keyExtractor={(row) => row.uuid}
			contentContainerStyle={{
				paddingBottom: space.xxl + miniPlayerInset,
				paddingHorizontal: people
					? space.lg / 2
					: tiles
						? space.lg - GENRE_GAP / 2
						: 0,
			}}
			onEndReachedThreshold={0.6}
			onEndReached={() => {
				if (active.hasNextPage && !active.isFetchingNextPage)
					void active.fetchNextPage();
			}}
			refreshControl={<RefreshControl onRefresh={() => active.refetch()} />}
			ListHeaderComponent={
				<View
					style={{
						paddingHorizontal: people
							? space.lg / 2
							: tiles
								? GENRE_GAP / 2
								: space.lg,
						paddingTop: space.sm,
						paddingBottom: space.md,
					}}
				>
					<SearchField placeholder={t("common.search")} onQuery={setQuery} />
				</View>
			}
			ListEmptyComponent={
				active.isError ? (
					<ErrorState onRetry={() => active.refetch()} />
				) : waitingOffline(active) ? (
					<OfflineState />
				) : active.isPending ? (
					<RowSkeleton square />
				) : (
					<EmptyState
						icon={META[kind].icon}
						title={t("mobile.library.empty")}
					/>
				)
			}
			ListFooterComponent={active.isFetchingNextPage ? <Spinner /> : null}
			renderItem={({ item }) =>
				tiles ? (
					<GenreTile
						href={hrefFor(item)}
						name={capitalizeFirst(item.name)}
						subtitle={t("media.item_count", { count: item.count })}
						cover={item.cover}
						square={item.square}
						color={item.color}
						width={genreWidth}
					/>
				) : people ? (
					<PersonTile
						href={hrefFor(item)}
						name={item.name}
						meta={
							kind === "narrators"
								? t("media.audiobook_count", { count: item.count })
								: t("media.book_count", { count: item.count })
						}
						icon={META[kind].icon}
						width={tileWidth}
					/>
				) : (
					<MediaRow
						href={hrefFor(item)}
						artwork={
							item.cover ? (
								<Cover
									cover={item.cover}
									width={item.square ? 48 : 40}
									shape={item.square ? "audio" : "book"}
								/>
							) : (
								<Monogram name={item.name} size={48} />
							)
						}
						title={item.name}
						subtitle={t("media.item_count", { count: item.count })}
					/>
				)
			}
		/>
	);
}

/** Web authors index card: a muted circle with a person glyph, the name
 * (two lines, medium) and the work count under it. */
function PersonTile({
	href,
	name,
	meta,
	icon,
	width,
}: {
	href: Href;
	name: string;
	meta: string;
	icon: IconName;
	width: number;
}) {
	const palette = usePalette();
	return (
		<PressableLink
			href={href}
			style={({ pressed }) => ({
				width,
				marginHorizontal: space.lg / 2,
				marginBottom: space.xl,
				alignItems: "center",
				gap: space.sm,
				opacity: pressed ? 0.7 : 1,
			})}
		>
			<View
				style={{
					width,
					height: width,
					borderRadius: radius.pill,
					backgroundColor: palette.surface,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon name={icon} size={width * 0.3} color={palette.textTertiary} />
			</View>
			<View style={{ alignItems: "center", gap: 2 }}>
				<Text variant="label" numberOfLines={2} style={{ textAlign: "center" }}>
					{name}
				</Text>
				<Text variant="caption" tone="secondary">
					{meta}
				</Text>
			</View>
		</PressableLink>
	);
}

/** The web's genre tile: the name on a plate of the cover's own colour, the
 * cover standing full height on the trailing side, flush with the base. A
 * genre is a place, not a book, so it reads as a banner. */
function GenreTile({
	href,
	name,
	subtitle,
	cover,
	square,
	color,
	width,
}: {
	href: Href;
	name: string;
	subtitle: string;
	cover?: string | null;
	square?: boolean;
	color?: string | null;
	width: number;
}) {
	const palette = usePalette();
	const height = width / GENRE_ASPECT;
	const plate = mutedAccentSurface(color);
	// The artwork never takes more than a third of the plate, or the name
	// breaks mid-word; it stands on the base either way.
	const coverWidth = Math.round(
		Math.min(
			(height - GENRE_INSET) / (square ? 1 : COVER_ASPECT),
			width * GENRE_ARTWORK_SHARE,
		),
	);
	const ink = plate ? "#ffffff" : palette.text;
	return (
		<PressableLink
			href={href}
			accessibilityLabel={name}
			style={({ pressed }) => ({
				width,
				height,
				marginHorizontal: GENRE_GAP / 2,
				marginBottom: GENRE_GAP,
				borderRadius: radius.card,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor: plate ?? palette.card,
				opacity: pressed ? 0.85 : 1,
			})}
		>
			{cover ? (
				<View
					style={{
						position: "absolute",
						right: GENRE_INSET,
						bottom: 0,
					}}
				>
					<Cover
						cover={cover}
						width={coverWidth}
						shape={square ? "audio" : "book"}
					/>
				</View>
			) : null}
			<View
				style={{
					padding: GENRE_PADDING,
					paddingRight: cover
						? coverWidth + GENRE_INSET + GENRE_PADDING / 2
						: GENRE_PADDING,
					gap: 2,
				}}
			>
				<Text
					variant="headline"
					numberOfLines={2}
					style={{ color: ink, fontWeight: "700" }}
				>
					{name}
				</Text>
				<Text
					variant="subhead"
					numberOfLines={1}
					style={{ color: ink, opacity: 0.7 }}
				>
					{subtitle}
				</Text>
			</View>
		</PressableLink>
	);
}
