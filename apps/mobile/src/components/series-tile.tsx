import { Link } from "expo-router";
import { View } from "react-native";
import { type MediaKind, routes } from "@/lib/routes";
import { usePalette } from "@/theme";
import { Cover } from "./cover";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

export type SeriesTileItem = {
	uuid: string;
	name: string;
	cover: string | null;
	color: string | null;
	subtitle: string;
};

/** Shelf-tile anatomy with two offset panels peeking behind the cover, so a
 * series reads as a stack rather than one volume. */
export function SeriesTile({
	item,
	kind,
	width,
}: {
	item: SeriesTileItem;
	kind: MediaKind;
	width: number;
}) {
	const palette = usePalette();
	const square = kind === "audiobook";
	const coverWidth = width - 12;
	const coverHeight = square ? coverWidth : Math.round(coverWidth * 1.5);
	return (
		<Link href={routes.series(item.uuid, kind)} asChild>
			<PressableScale
				accessibilityRole="button"
				accessibilityLabel={item.name}
				style={{ width, gap: 12 }}
			>
				<View style={{ width, height: coverHeight + 8 }}>
					{[
						{ top: 0, left: 12, opacity: 0.45 },
						{ top: 4, left: 6, opacity: 0.7 },
					].map((panel) => (
						<View
							key={panel.left}
							style={{
								position: "absolute",
								top: panel.top,
								left: panel.left,
								width: coverWidth,
								height: coverHeight,
								borderRadius: palette.coverRadius,
								backgroundColor: item.color ?? palette.surface,
								opacity: panel.opacity,
							}}
						/>
					))}
					<View style={{ position: "absolute", top: 8, left: 0 }}>
						<Cover
							cover={item.cover}
							color={item.color}
							width={coverWidth}
							shape={square ? "audio" : "book"}
							recyclingKey={item.uuid}
						/>
					</View>
				</View>
				<View style={{ gap: 4, minHeight: 64, paddingHorizontal: 2 }}>
					<Text variant="tileTitle" numberOfLines={2}>
						{item.name}
					</Text>
					<Text variant="subhead" tone="secondary" numberOfLines={1}>
						{item.subtitle}
					</Text>
				</View>
			</PressableScale>
		</Link>
	);
}
