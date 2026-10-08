import { FlatList, View } from "react-native";
import { SectionHeader } from "@/components/section-header";
import { SeriesTile, type SeriesTileItem } from "@/components/series-tile";
import { ShelfSkeleton } from "@/components/skeleton";
import type { MediaKind } from "@/lib/routes";
import { sizes, space } from "@/theme";

export function SeriesShelf({
	title,
	kind,
	items,
	loading,
}: {
	loading?: boolean;
	title: string;
	kind: MediaKind;
	items: SeriesTileItem[] | undefined;
}) {
	if (!loading && (!items || items.length === 0)) return null;
	return (
		<View style={{ gap: space.md }}>
			<SectionHeader
				title={title}
				href={{
					pathname: "/series",
					params: { format: kind === "audiobook" ? "audiobook" : "ebook" },
				}}
			/>
			{loading || !items ? (
				<ShelfSkeleton
					width={sizes.tile}
					shape={kind === "audiobook" ? "series-square" : "series"}
				/>
			) : (
				<FlatList
					horizontal
					// Only what fits, and a screen either side.
					initialNumToRender={3}
					windowSize={3}
					data={items}
					keyExtractor={(item) => item.uuid}
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}
					renderItem={({ item }) => (
						<SeriesTile item={item} kind={kind} width={sizes.tile} />
					)}
				/>
			)}
		</View>
	);
}
