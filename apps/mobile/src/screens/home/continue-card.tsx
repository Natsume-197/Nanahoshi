import { router } from "expo-router";
import { View } from "react-native";
import { BookMenuTarget } from "@/components/book-menu";
import { Cover } from "@/components/cover";
import { PressableScale } from "@/components/pressable-scale";
import { Bone, SkeletonPulse } from "@/components/skeleton";
import { Text } from "@/components/text";
import { mutedAccentSurface } from "@/lib/color";
import { titleOrUntitled } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { MediaKind } from "@/lib/routes";
import { usePlayer } from "@/player/provider";
import {
	COVER_ASPECT,
	radius,
	shadows,
	sizes,
	space,
	type,
	usePalette,
} from "@/theme";

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
const PADDING = 10;
/** Tall enough for the fullest card (two-line title, author, meta), so every
 * card in the rail is the same height. */
const CARD_HEIGHT =
	PADDING * 2 +
	Math.max(
		COVER_SLOT,
		type.cardTitle.lineHeight * 2 + type.cardMeta.lineHeight * 2 + 2 * 2,
	);

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
	const player = usePlayer();
	// Like the web's resume card: straight into the reader or the player.
	const resume = () => {
		if (!audio)
			return router.push({
				pathname: "/reader/[uuid]",
				params: { uuid: item.uuid },
			});
		haptics.tap();
		if (player.getSnapshot().book?.uuid === item.uuid) player.toggle();
		else
			void player.play(item.uuid, {
				preview: {
					title: item.title ?? "",
					cover: item.cover,
					color: item.color,
					authors: item.authors ? [item.authors] : [],
				},
			});
	};

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
			// Fills the rail's row, so every card matches the tallest one.
			style={{ width, flex: 1 }}
		>
			{(onLongPress) => (
				<PressableScale
					scaleOnPress={false}
					onPress={resume}
					onLongPress={onLongPress}
					accessibilityRole="button"
					accessibilityLabel={`${titleOrUntitled(item.title)}, ${meta}`}
					style={{
						width,
						flex: 1,
						flexDirection: "row",
						alignItems: "center",
						gap: 10,
						minHeight: CARD_HEIGHT,
						padding: PADDING,
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
								width={
									audio ? COVER_SLOT : Math.round(COVER_SLOT / COVER_ASPECT)
								}
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

/** The rail while progress loads: plates the size of the real cards. */
export function ContinueSkeleton({ width }: { width: number }) {
	const palette = usePalette();
	return (
		<SkeletonPulse>
			<View
				style={{
					flexDirection: "row",
					gap: space.lg,
					paddingHorizontal: space.lg,
					overflow: "hidden",
				}}
			>
				{["a", "b"].map((key) => (
					<View
						key={key}
						style={{
							width,
							height: CARD_HEIGHT,
							flexDirection: "row",
							alignItems: "center",
							gap: 10,
							padding: PADDING,
							borderRadius: radius.card,
							borderCurve: "continuous",
							backgroundColor: palette.card,
						}}
					>
						<Bone
							width={Math.round(COVER_SLOT / COVER_ASPECT)}
							height={COVER_SLOT}
							radius={palette.coverRadius}
						/>
						<View style={{ flex: 1, gap: 8 }}>
							<Bone width="80%" height={11} />
							<Bone width="50%" height={10} />
							<Bone width="35%" height={10} />
						</View>
					</View>
				))}
			</View>
		</SkeletonPulse>
	);
}
