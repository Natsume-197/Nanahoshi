import { FlatList, View } from "react-native";
import { SectionHeader } from "@/components/section-header";
import { SeriesTile, type SeriesTileItem } from "@/components/series-tile";
import type { MediaKind } from "@/lib/routes";
import { sizes, space } from "@/theme";

export function SeriesShelf({
	title,
	kind,
	items,
}: {
	title: string;
	kind: MediaKind;
	items: SeriesTileItem[] | undefined;
}) {
	if (!items || items.length === 0) return null;
	return (
		<View style={{ gap: space.lg }}>
			<SectionHeader
				title={title}
				href={{
					pathname: "/series",
					params: { format: kind === "audiobook" ? "audiobook" : "ebook" },
				}}
			/>
			<FlatList
				horizontal
				data={items}
				keyExtractor={(item) => item.uuid}
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}
				renderItem={({ item }) => (
					<SeriesTile item={item} kind={kind} width={sizes.tile} />
				)}
			/>
		</View>
	);
}
