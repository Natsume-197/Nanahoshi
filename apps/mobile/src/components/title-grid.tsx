import { FlashList } from "@shopify/flash-list";
import type { ReactElement } from "react";
import { RefreshControl, View } from "react-native";
import { useGridTileWidth } from "@/hooks/use-grid-tile-width";
import { t } from "@/lib/i18n";
import { space } from "@/theme";
import { icons } from "./icon";
import { EmptyState, ErrorState, ShelfSkeleton, Spinner } from "./states";
import { type TileItem, TitleTile } from "./title-tile";

type Paged = {
	isPending: boolean;
	isError: boolean;
	isRefetching: boolean;
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
}: {
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
	const allSquare =
		items.length > 0 && items.every((item) => item.kind === "audiobook");

	return (
		<FlashList
			data={items}
			numColumns={2}
			contentInsetAdjustmentBehavior="automatic"
			keyExtractor={(item) => `${item.kind}:${item.uuid}`}
			ListHeaderComponent={header}
			contentContainerStyle={{
				paddingHorizontal: space.lg - gap / 2,
				paddingBottom: space.xxl,
			}}
			onEndReachedThreshold={0.6}
			onEndReached={() => {
				if (query.hasNextPage && !query.isFetchingNextPage)
					void query.fetchNextPage();
			}}
			refreshControl={
				<RefreshControl
					refreshing={query.isRefetching && !query.isFetchingNextPage}
					onRefresh={() => void query.refetch()}
				/>
			}
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
