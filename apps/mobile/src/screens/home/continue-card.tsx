import { router } from "expo-router";
import { View } from "react-native";
import { BookMenuTarget } from "@/components/book-menu";
import { Cover } from "@/components/cover";
import { PressableScale } from "@/components/pressable-scale";
import { Text } from "@/components/text";
import { mutedAccentSurface } from "@/lib/color";
import { titleOrUntitled } from "@/lib/format";
import { t } from "@/lib/i18n";
import { type MediaKind, routes } from "@/lib/routes";
import { radius, shadows, sizes, usePalette } from "@/theme";

export type ContinueItem = {
	uuid: string;
	kind: MediaKind;
	title: string | null;
	cover: string | null;
	color: string | null;
	authors: string;
	progress: number;
	lastActivity: string | null;
};

const COVER_SLOT = sizes.resumeCover;

/**
 * The web's resume card (BookCardShell, orientation="horizontal"): a 16pt
 * rounded plate in the cover's own colour, muted toward charcoal so white text
 * holds AA, cover in a 64pt slot beside a 13pt title, author and
 * "Book · 42%". Flat, no progress bar — the tint lifts it off the canvas.
 */
export function ContinueCard({
	item,
	width,
}: {
	item: ContinueItem;
	width: number;
}) {
	const palette = usePalette();
	const plate = mutedAccentSurface(item.color);
	const ink = plate ? "#ffffff" : palette.text;
	const meta = `${item.kind === "audiobook" ? t("home.format_audiobook") : t("home.format_book")} · ${t("home.percent_read", { percent: item.progress })}`;
	const audio = item.kind === "audiobook";

	return (
		<BookMenuTarget
			target={{
				uuid: item.uuid,
				kind: item.kind,
				title: item.title,
				cover: item.cover,
				color: item.color,
				subtitle: item.authors,
			}}
			style={{ width }}
		>
			{(onLongPress) => (
				<PressableScale
					onPress={() => router.push(routes.title(item.kind, item.uuid))}
					onLongPress={onLongPress}
					accessibilityRole="button"
					accessibilityLabel={`${titleOrUntitled(item.title)}, ${meta}`}
					style={{
						width,
						flexDirection: "row",
						alignItems: "center",
						gap: 10,
						padding: 10,
						borderRadius: radius.card,
						borderCurve: "continuous",
						backgroundColor: plate ?? palette.card,
					}}
				>
					<View
						style={{
							width: COVER_SLOT,
							height: COVER_SLOT,
							justifyContent: "center",
						}}
					>
						<View
							style={{
								boxShadow: shadows.cover,
								alignSelf: "flex-start",
							}}
						>
							<Cover
								cover={item.cover}
								color={item.color}
								width={audio ? COVER_SLOT : Math.round(COVER_SLOT / 1.5)}
								shape={audio ? "audio" : "book"}
								recyclingKey={item.uuid}
							/>
						</View>
					</View>
					<View style={{ flex: 1, gap: 2, paddingRight: 8 }}>
						<Text numberOfLines={2} variant="cardTitle" style={{ color: ink }}>
							{titleOrUntitled(item.title)}
						</Text>
						{item.authors ? (
							<Text numberOfLines={1} variant="cardMeta" style={{ color: ink }}>
								{item.authors}
							</Text>
						) : null}
						<Text
							variant="cardMeta"
							style={{
								color: ink,
								fontVariant: ["tabular-nums"],
							}}
						>
							{meta}
						</Text>
					</View>
				</PressableScale>
			)}
		</BookMenuTarget>
	);
}
