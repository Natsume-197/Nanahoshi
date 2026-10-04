import type { Href } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import Animated from "react-native-reanimated";
import { sizes, space } from "@/theme";
import { SectionHeader } from "./section-header";
import { useArrival } from "./skeleton";
import { ShelfSkeleton } from "./states";
import { type TileItem, TitleTile } from "./title-tile";

/** The web's phone rail: 150pt tiles, 16pt apart, 16pt page gutter. */
export const SHELF_TILE_WIDTH = sizes.tile;

export function Shelf({
	title,
	href,
	onMore,
	items,
	loading,
	audio,
	detail = false,
}: {
	/** Audiobook-only row: square placeholders before the items arrive. */
	audio?: boolean;
	detail?: boolean;
	title: string;
	href?: Href;
	onMore?: () => void;
	items: TileItem[] | undefined;
	loading?: boolean;
}) {
	const { width } = useWindowDimensions();
	const gutter = detail
		? width >= 1024
			? 32
			: width >= 768
				? 24
				: 16
		: space.lg;
	const tileWidth = detail ? (width >= 768 ? 140 : 120) : SHELF_TILE_WIDTH;
	const arrival = useArrival(!loading && !!items);
	if (!loading && (!items || items.length === 0)) return null;
	// A row of nothing but square artwork uses the square frame, as on the web.
	const allSquare =
		items && items.length > 0
			? items.every((item) => item.kind === "audiobook")
			: !!audio;

	return (
		<View style={{ gap: space.lg }}>
			<SectionHeader
				gutter={gutter}
				title={title}
				href={href}
				onPress={onMore}
			/>
			{loading || !items ? (
				<ShelfSkeleton width={tileWidth} audio={allSquare} gutter={gutter} />
			) : (
				<Animated.FlatList
					entering={arrival}
					horizontal
					data={items}
					keyExtractor={(item) => `${item.kind}:${item.uuid}`}
					renderItem={({ item }) => (
						<TitleTile
							item={item}
							width={tileWidth}
							frame={allSquare ? "square" : "book"}
						/>
					)}
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ paddingHorizontal: gutter, gap: space.lg }}
					initialNumToRender={3}
					windowSize={5}
				/>
			)}
		</View>
	);
}
