import { type Href, router } from "expo-router";
import type { ReactNode, Ref } from "react";
import { Pressable, type PressableProps, View } from "react-native";
import { IS_ANDROID } from "@/lib/platform";
import { radius, shadows, space, usePalette } from "@/theme";
import { Cover } from "./cover";
import { Icon, type IconName, icons } from "./icon";
import { Text } from "./text";

/** Every artwork sits in the same 112pt slot so titles align down the list. */
const SLOT = 112;

/** The web's search result row: artwork slot, a two-line semibold title, a
 * muted subtitle, a small meta line ("Book", "Author · 12 books") and a
 * chevron. Pressing tints the row, the way the web's active state does. */
export function ResultRow({
	ref,
	href,
	onPress,
	onLongPress,
	artwork,
	title,
	subtitle,
	meta,
	trailing,
}: {
	ref?: Ref<View>;
	href?: Href;
	onPress?: () => void;
	onLongPress?: PressableProps["onLongPress"];
	artwork: ReactNode;
	title: string;
	subtitle?: string | null;
	meta?: string;
	trailing?: ReactNode;
}) {
	const palette = usePalette();
	const row = (
		<Pressable
			ref={ref}
			android_ripple={{ color: palette.ripple }}
			onLongPress={onLongPress}
			onPress={() => {
				onPress?.();
				if (href) router.push(href);
			}}
			accessibilityRole="button"
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.lg,
				minHeight: 128,
				paddingHorizontal: space.md,
				paddingVertical: space.md,
				borderRadius: radius.field,
				borderCurve: "continuous",
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surfaceCardHover : "transparent",
			})}
		>
			<View
				style={{
					width: SLOT,
					height: SLOT,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				{artwork}
			</View>
			<View style={{ flex: 1, gap: space.xs }}>
				<Text variant="listTitle" numberOfLines={2}>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="subhead" tone="secondary" numberOfLines={2}>
						{subtitle}
					</Text>
				) : null}
				{meta ? (
					<Text variant="metaLabel" tone="secondary" style={{ marginTop: 2 }}>
						{meta}
					</Text>
				) : null}
			</View>
			{trailing ?? (
				<Icon
					name={icons.chevronRight}
					size={16}
					color={palette.textSecondary}
				/>
			)}
		</Pressable>
	);
	return row;
}

/** Hairline between rows, inset to the row's rounded press area. */
export function ResultDivider() {
	const palette = usePalette();
	return (
		<View
			style={{
				height: 1,
				marginHorizontal: space.lg,
				backgroundColor: palette.separator,
				opacity: 0.6,
			}}
		/>
	);
}

/** A book cover (74×111) or a square audiobook/collection tile (80). */
export function CoverArt({
	cover,
	color,
	square,
	fallback = icons.book,
	recyclingKey,
}: {
	cover: string | null | undefined;
	color?: string | null;
	square?: boolean;
	fallback?: IconName;
	recyclingKey?: string;
}) {
	const palette = usePalette();
	if (!cover) {
		return (
			<View
				style={{
					width: square ? 80 : 74,
					height: square ? 80 : 111,
					borderRadius: square ? radius.field - 3 : palette.coverRadius,
					backgroundColor: palette.surface,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon name={fallback} size={28} color={palette.textSecondary} />
			</View>
		);
	}
	return (
		<View
			style={{ boxShadow: shadows.card, borderRadius: palette.coverRadius }}
		>
			<Cover
				cover={cover}
				color={color}
				width={square ? 80 : 74}
				shape={square ? "audio" : "book"}
				recyclingKey={recyclingKey}
			/>
		</View>
	);
}

/** Up to three volumes stacked diagonally, first in front (web SeriesArtwork). */
export function SeriesDeck({ covers }: { covers: string[] }) {
	const unique = Array.from(new Set(covers.filter(Boolean))).slice(0, 3);
	if (unique.length === 0)
		return <CoverArt cover={null} fallback={icons.series} />;
	const deckWidth = 64 + (unique.length - 1) * 16;
	const deckHeight = 98 + (unique.length - 1) * 7;
	const left = (SLOT - deckWidth) / 2;
	const bottom = (SLOT - deckHeight) / 2;
	return (
		<View style={{ width: SLOT, height: SLOT }}>
			{unique.map((cover, index) => (
				<View
					key={cover}
					style={{
						position: "absolute",
						left: left + index * 16,
						bottom: bottom + index * 7,
						zIndex: unique.length - index,
						boxShadow: shadows.raised,
					}}
				>
					<Cover cover={cover} width={64} shape="book" />
				</View>
			))}
		</View>
	);
}

/** Authors, narrators and people: a 64pt muted circle with a person glyph. */
export function PortraitArt({ icon = icons.author }: { icon?: IconName }) {
	const palette = usePalette();
	return (
		<View
			style={{
				width: 64,
				height: 64,
				borderRadius: radius.pill,
				backgroundColor: palette.surface,
				borderWidth: 1,
				borderColor: palette.separator,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Icon name={icon} size={28} color={palette.textSecondary} />
		</View>
	);
}
