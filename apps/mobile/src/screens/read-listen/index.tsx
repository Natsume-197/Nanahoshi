import type { ReadListenPairing } from "@nanahoshi/api/routers/read-listen/read-listen.service";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { BookMenuTarget } from "@/components/book-menu";
import { ChipRow } from "@/components/chip";
import { Cover } from "@/components/cover";
import { icons } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { RefreshControl } from "@/components/refresh-control";
import { Bone, SkeletonPulse } from "@/components/skeleton";
import { SortButton } from "@/components/sort-button";
import {
	EmptyState,
	ErrorState,
	OfflineState,
	Spinner,
	waitingOffline,
} from "@/components/states";
import { Text } from "@/components/text";
import { useGridTileWidth } from "@/hooks/use-grid-tile-width";
import { joinNames, titleOrUntitled } from "@/lib/format";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { usePrefetchOnPress } from "@/lib/title-queries";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { COVER_ASPECT, space, usePalette } from "@/theme";
import {
	type AlignmentFilter,
	type ReadListenSort,
	sortPairings,
} from "./model";

const PAGE = 30;
const GAP = space.sm;

/** The web's /dashboard/read-listen: every ebook paired with its audiobook,
 * ready to read along by default, as a two-column grid. */
export function ReadListenScreen() {
	const { orpc } = useApi();
	const miniPlayerInset = useMiniPlayerInset();
	const width = useGridTileWidth(2, GAP);
	const [alignment, setAlignment] = useState<AlignmentFilter>("ready");
	const [sort, setSort] = useState<ReadListenSort>("recent");
	const pairings = useInfiniteQuery(
		orpc.readListen.listPairings.infiniteOptions({
			input: (offset: number) => ({ offset, limit: PAGE, alignment }),
			initialPageParam: 0,
			getNextPageParam: (last) => last.nextOffset ?? undefined,
		}),
	);
	const items = sortPairings(
		pairings.data?.pages.flatMap((page) => page.items) ?? [],
		sort,
	);

	return (
		<FlashList
			showsVerticalScrollIndicator={false}
			data={items}
			numColumns={2}
			contentInsetAdjustmentBehavior="automatic"
			keyExtractor={(pairing) => pairing.id}
			contentContainerStyle={{
				paddingHorizontal: space.lg - GAP / 2,
				paddingBottom: space.xxl + miniPlayerInset,
			}}
			onEndReachedThreshold={0.6}
			onEndReached={() => {
				if (pairings.hasNextPage && !pairings.isFetchingNextPage)
					void pairings.fetchNextPage();
			}}
			refreshControl={<RefreshControl onRefresh={() => pairings.refetch()} />}
			ListHeaderComponent={
				<View
					style={{
						gap: space.md,
						paddingTop: space.sm,
						paddingBottom: space.lg,
						marginHorizontal: -(space.lg - GAP / 2),
					}}
				>
					<ChipRow
						value={alignment}
						onChange={setAlignment}
						options={[
							{ value: "ready", label: t("read_listen.status_ready") },
							{
								value: "not_imported",
								label: t("read_listen.status_not_imported"),
							},
							{ value: "stale", label: t("read_listen.status_stale") },
							{ value: "any", label: t("common.any") },
						]}
					/>
					<View style={{ paddingHorizontal: space.lg }}>
						<SortButton
							value={sort}
							onChange={setSort}
							options={[
								{ value: "recent", label: t("mobile.library.recents") },
								{ value: "title", label: t("common.title") },
								{ value: "author", label: t("common.author") },
							]}
						/>
					</View>
				</View>
			}
			ListEmptyComponent={
				pairings.isError ? (
					<ErrorState onRetry={() => void pairings.refetch()} />
				) : waitingOffline(pairings) ? (
					<OfflineState />
				) : pairings.isPending ? (
					<PairGridSkeleton width={width} />
				) : (
					<EmptyState
						icon={icons.readListen}
						title={t("read_listen.empty_title")}
						message={t("read_listen.empty_description")}
					/>
				)
			}
			ListFooterComponent={pairings.isFetchingNextPage ? <Spinner /> : null}
			renderItem={({ item }) => (
				<View style={{ paddingHorizontal: GAP / 2, paddingBottom: space.xl }}>
					<PairTile pairing={item} width={width} />
				</View>
			)}
		/>
	);
}

/** The web's PairGridCard: the book's cover with its audiobook's square art
 * resting on its lower corner; opens the audiobook, named after it too. */
function PairTile({
	pairing,
	width,
}: {
	pairing: ReadListenPairing;
	width: number;
}) {
	const prefetch = usePrefetchOnPress();
	const { audiobook } = pairing;
	const authors = joinNames(audiobook.authors);
	return (
		<BookMenuTarget
			target={{
				uuid: audiobook.uuid,
				kind: "audiobook",
				title: audiobook.title,
				cover: audiobook.cover,
				color: audiobook.mainColor,
				subtitle: authors,
			}}
			style={{ width }}
		>
			{(onLongPress) => (
				<PressableScale
					scaleOnPress={false}
					{...prefetch("audiobook", audiobook.uuid, audiobook.cover)}
					onPress={() => {
						prefetch("audiobook", audiobook.uuid, audiobook.cover).onPress();
						router.push(routes.title("audiobook", audiobook.uuid));
					}}
					onLongPress={onLongPress}
					accessibilityRole="button"
					accessibilityLabel={[titleOrUntitled(audiobook.title), authors]
						.filter(Boolean)
						.join(", ")}
					style={{ width, gap: 12 }}
				>
					<StackedCover pairing={pairing} width={width} />
					<View style={{ gap: 4, paddingHorizontal: 2, minHeight: 64 }}>
						<Text numberOfLines={2} variant="tileTitle">
							{titleOrUntitled(audiobook.title)}
						</Text>
						{authors ? (
							<Text
								variant="subhead"
								tone="secondary"
								numberOfLines={1}
								style={{ lineHeight: 22 }}
							>
								{authors}
							</Text>
						) : null}
					</View>
				</PressableScale>
			)}
		</BookMenuTarget>
	);
}

function StackedCover({
	pairing,
	width,
}: {
	pairing: ReadListenPairing;
	width: number;
}) {
	const palette = usePalette();
	const audioWidth = Math.round(width * 0.68);
	return (
		<View style={{ width, height: Math.round(width * COVER_ASPECT) }}>
			<Cover
				cover={pairing.ebook.cover}
				color={pairing.ebook.mainColor}
				width={width}
				recyclingKey={pairing.ebook.uuid}
			/>
			<View
				style={{
					position: "absolute",
					right: Math.round(width * 0.06),
					bottom: Math.round(width * COVER_ASPECT * 0.05),
					borderRadius: palette.coverRadius,
					boxShadow: "0 8px 20px rgba(0, 0, 0, 0.4)",
				}}
			>
				<Cover
					cover={pairing.audiobook.cover}
					color={pairing.audiobook.mainColor}
					width={audioWidth}
					shape="audio"
					recyclingKey={pairing.audiobook.uuid}
				/>
			</View>
		</View>
	);
}

/** Two rows of pair tiles while the first page loads. */
function PairGridSkeleton({ width }: { width: number }) {
	const palette = usePalette();
	const height = Math.round(width * COVER_ASPECT);
	const audioWidth = Math.round(width * 0.68);
	return (
		<SkeletonPulse>
			<View
				style={{
					flexDirection: "row",
					flexWrap: "wrap",
					paddingHorizontal: GAP / 2,
					gap: GAP,
					rowGap: space.xl,
				}}
			>
				{["a", "b", "c", "d"].map((key) => (
					<View key={key} style={{ width, gap: 12 }}>
						<View style={{ width, height }}>
							<Bone width={width} height={height} radius={6} />
						</View>
						<View style={{ gap: 8, minHeight: 64, paddingHorizontal: 2 }}>
							<Bone width={width * 0.85} height={14} />
							<Bone width={width * 0.5} height={12} />
						</View>
						<View
							style={{
								position: "absolute",
								right: Math.round(width * 0.06),
								top: height - Math.round(height * 0.05) - audioWidth,
								// A rim of page colour sets the square apart from the cover.
								padding: 2,
								borderRadius: 8,
								backgroundColor: palette.background,
							}}
						>
							<Bone width={audioWidth} height={audioWidth} radius={6} />
						</View>
					</View>
				))}
			</View>
		</SkeletonPulse>
	);
}
