import { useQuery } from "@tanstack/react-query";
import { useScrollToTop } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { CollectionMenuTarget } from "@/components/collection-menu";
import { CollectionRow } from "@/components/collection-row";
import { Fab } from "@/components/fab";
import { openFormSheet } from "@/components/form-sheet/open";
import { LineTabs } from "@/components/line-tabs";
import { PageHeader } from "@/components/page-header";
import { RefreshControl } from "@/components/refresh-control";
import { RowSkeleton } from "@/components/states";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { routes } from "@/lib/routes";
import { shelfMeta } from "@/lib/shelves";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";

type Format = "ebook" | "audiobook";

const FORMATS: Format[] = ["ebook", "audiobook"];

/**
 * The web's collections page on a phone: "Listas de libros / Listas de
 * audiolibros" line tabs over two pages you can also swipe between; each is
 * the four reading-status shelves, a separator, then the user's collections
 * — all as 80pt-mosaic rows — and a floating create button.
 */
export function Collections() {
	const miniPlayerInset = useMiniPlayerInset();
	const scrollRef = useRef<ScrollView>(null);
	const pagerRef = useRef<ScrollView>(null);
	useScrollToTop(scrollRef);
	const { orpc } = useApi();
	const { width } = useWindowDimensions();
	const [format, setFormat] = useState<Format>("ebook");
	// The pager is as tall as the page on screen; while a swipe is under way
	// the taller one, so the incoming page never shows cut off.
	const [heights, setHeights] = useState<Record<Format, number>>({
		ebook: 0,
		audiobook: 0,
	});
	const [swiping, setSwiping] = useState(false);
	const shelves = useQuery(orpc.shelves.summaries.queryOptions());
	const collections = useQuery(orpc.collections.list.queryOptions());
	const pagerHeight = swiping
		? Math.max(heights.ebook, heights.audiobook)
		: heights[format];

	const showFormat = (next: Format) => {
		setFormat(next);
		pagerRef.current?.scrollTo({ x: FORMATS.indexOf(next) * width });
	};
	const settle = (x: number) => {
		setSwiping(false);
		const next = FORMATS[Math.round(x / width)];
		if (next) setFormat(next);
	};

	return (
		<View style={{ flex: 1 }}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				ref={scrollRef}
				contentInsetAdjustmentBehavior={
					process.env.EXPO_OS === "ios" ? "never" : "automatic"
				}
				contentContainerStyle={{ paddingBottom: 96 + miniPlayerInset }}
				refreshControl={
					<RefreshControl
						onRefresh={() =>
							Promise.all([shelves.refetch(), collections.refetch()])
						}
					/>
				}
			>
				<PageHeader title={t("nav.collections")} />
				{/* Line tabs run edge to edge, as on the profile; iOS's segmented
				    control keeps the page margins. */}
				<View
					style={{
						paddingHorizontal: IS_ANDROID ? 0 : space.lg,
						paddingTop: space.xl,
					}}
				>
					<LineTabs
						value={format}
						onChange={showFormat}
						options={[
							{ value: "ebook", label: t("collection.book_lists") },
							{ value: "audiobook", label: t("collection.audiobook_lists") },
						]}
					/>
				</View>
				<ScrollView
					ref={pagerRef}
					horizontal
					pagingEnabled
					nestedScrollEnabled
					showsHorizontalScrollIndicator={false}
					overScrollMode="never"
					bounces={false}
					onScrollBeginDrag={() => setSwiping(true)}
					onMomentumScrollEnd={(event) =>
						settle(event.nativeEvent.contentOffset.x)
					}
					style={{ height: pagerHeight || undefined }}
					contentContainerStyle={{ alignItems: "flex-start" }}
				>
					{FORMATS.map((page) => (
						<View
							key={page}
							style={{ width }}
							onLayout={(event) => {
								const height = event.nativeEvent.layout.height;
								setHeights((current) =>
									current[page] === height
										? current
										: { ...current, [page]: height },
								);
							}}
						>
							<CollectionsPage format={page} />
						</View>
					))}
				</ScrollView>
			</ScrollView>

			<Fab
				label={t("collection.create_title")}
				onPress={() => openFormSheet({ form: "newCollection" })}
			/>
		</View>
	);
}

/** One format's shelves and collections. */
function CollectionsPage({ format }: { format: Format }) {
	const { orpc } = useApi();
	const palette = usePalette();
	const shelves = useQuery(orpc.shelves.summaries.queryOptions());
	const collections = useQuery(orpc.collections.list.queryOptions());
	const loading = shelves.isPending || collections.isPending;
	const audio = format === "audiobook";

	const visibleCollections = (collections.data ?? []).filter((collection) => {
		// Dynamic collections have no stored counts; they match either format.
		if (collection.kind === "dynamic" || collection.ebookCount == null)
			return true;
		return audio
			? (collection.audiobookCount ?? 0) > 0
			: (collection.ebookCount ?? 0) > 0;
	});

	return (
		<View
			style={{
				paddingHorizontal: space.lg,
				paddingTop: space.xl,
				gap: space.xl,
			}}
		>
			{loading ? (
				<RowSkeleton square count={6} />
			) : (
				<>
					<View style={{ gap: space.xs, marginHorizontal: -space.lg }}>
						{(shelves.data ?? []).map((shelf) => {
							const meta = shelfMeta(shelf.status, format);
							const count = audio ? shelf.audiobookCount : shelf.ebookCount;
							return (
								<CollectionRow
									key={shelf.status}
									href={{
										pathname: "/shelf/[status]",
										params: { status: shelf.status, format },
									}}
									name={meta.label}
									covers={
										audio
											? shelf.audiobookPreviewCovers
											: shelf.ebookPreviewCovers
									}
									fallbackIcon={meta.icon}
									subtitle={t("media.item_count", { count })}
								/>
							);
						})}
					</View>

					<View style={{ height: 1, backgroundColor: palette.separator }} />

					{visibleCollections.length > 0 ? (
						<View style={{ gap: space.xs, marginHorizontal: -space.lg }}>
							{visibleCollections.map((collection) => {
								const count = audio
									? collection.audiobookCount
									: collection.ebookCount;
								const covers = audio
									? collection.audiobookPreviewCovers
									: collection.ebookPreviewCovers;
								return (
									<CollectionMenuTarget
										key={collection.id}
										collection={{ ...collection, isOwner: true }}
									>
										{(onLongPress) => (
											<CollectionRow
												onLongPress={onLongPress}
												href={routes.collection(collection.id)}
												name={collection.name}
												covers={
													covers.length > 0 ? covers : collection.previewCovers
												}
												subtitle={
													count == null ? "…" : t("media.item_count", { count })
												}
												dynamicLabel={
													collection.kind === "dynamic"
														? t("collection.dynamic")
														: null
												}
											/>
										)}
									</CollectionMenuTarget>
								);
							})}
						</View>
					) : (
						<View
							style={{
								borderRadius: radius.field,
								borderCurve: "continuous",
								backgroundColor: palette.surface,
								paddingHorizontal: 20,
								paddingVertical: space.xxl,
								gap: space.xs,
							}}
						>
							<Text variant="headline">
								{audio
									? t("collection.no_audiobook_collections_title")
									: t("collection.no_book_collections_title")}
							</Text>
							<Text variant="subhead" tone="secondary">
								{audio
									? t("collection.no_audiobook_collections_desc")
									: t("collection.no_book_collections_desc")}
							</Text>
						</View>
					)}
				</>
			)}
		</View>
	);
}
