import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useScrollToTop } from "expo-router";
import { type ReactElement, useRef } from "react";
import { View } from "react-native";
import Animated, { type ScrollHandlerProcessed } from "react-native-reanimated";
import { RefreshControl } from "@/components/refresh-control";
import { useGridTileWidth } from "@/hooks/use-grid-tile-width";
import { t } from "@/lib/i18n";
import { useMiniPlayerInset } from "@/player/mini-player";
import { space } from "@/theme";
import { icons } from "./icon";
import { EmptyState, ErrorState, ShelfSkeleton, Spinner } from "./states";
import { type TileItem, TitleTile } from "./title-tile";

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<TileItem>);

type Paged = {
	isPending: boolean;
	isError: boolean;
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	fetchNextPage: () => unknown;
	refetch: () => unknown;
};

/**
 * The web's BOOK_GRID_CLASS on phones: two columns, 8pt apart, 16pt gutters,
 * shelf-tile anatomy. A whole grid of audiobooks switches to square frames.
 */
export function TitleGrid({
	items,
	query,
	header,
	emptyTitle,
	emptyMessage,
	empty,
	onScroll,
}: {
	/** A worklet scroll handler; the header then draws under the bars. */
	onScroll?: ScrollHandlerProcessed<Record<string, unknown>>;
	/** Replaces the empty state outright (a profile's overview tab). */
	empty?: ReactElement | null;
	items: TileItem[];
	query: Paged;
	header?: ReactElement | null;
	emptyTitle?: string;
	emptyMessage?: string;
}) {
	const gap = space.sm;
	const width = useGridTileWidth(2, gap);
	const listRef = useRef<FlashListRef<TileItem>>(null);
	const miniPlayerInset = useMiniPlayerInset();
	// Re-tapping the tab scrolls a root grid back up (no-op on pushed pages).
	useScrollToTop(listRef);
	const List = onScroll ? AnimatedFlashList : FlashList<TileItem>;
	const allSquare =
		items.length > 0 && items.every((item) => item.kind === "audiobook");

	return (
		<List
			ref={listRef}
			data={items}
			numColumns={2}
			contentInsetAdjustmentBehavior={onScroll ? "never" : "automatic"}
			onScroll={onScroll}
			scrollEventThrottle={onScroll ? 16 : undefined}
			keyExtractor={(item) => `${item.kind}:${item.uuid}`}
			ListHeaderComponent={header}
			contentContainerStyle={{
				paddingHorizontal: space.lg - gap / 2,
				paddingBottom: space.xxl + miniPlayerInset,
			}}
			onEndReachedThreshold={0.6}
			onEndReached={() => {
				if (query.hasNextPage && !query.isFetchingNextPage)
					void query.fetchNextPage();
			}}
			refreshControl={<RefreshControl onRefresh={() => query.refetch()} />}
			ListEmptyComponent={
				empty !== undefined ? (
					<View style={{ marginHorizontal: -(space.lg - gap / 2) }}>
						{empty}
					</View>
				) : query.isError ? (
					<ErrorState onRetry={() => void query.refetch()} />
				) : query.isPending ? (
					<View style={{ marginHorizontal: -(space.lg - gap / 2) }}>
						<ShelfSkeleton width={width} />
					</View>
				) : (
					<EmptyState
						icon={icons.shelf}
						title={emptyTitle ?? t("mobile.library.empty")}
						message={emptyMessage}
					/>
				)
			}
			ListFooterComponent={query.isFetchingNextPage ? <Spinner /> : null}
			renderItem={({ item }) => (
				<View style={{ paddingHorizontal: gap / 2, paddingBottom: space.xl }}>
					<TitleTile
						item={item}
						width={width}
						frame={allSquare ? "square" : "book"}
					/>
				</View>
			)}
		/>
	);
}
