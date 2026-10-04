import type { Href } from "expo-router";
import { View } from "react-native";
import { PressableLink } from "@/components/pressable-link";
import { IS_ANDROID } from "@/lib/platform";
import { radius, shadows, space, usePalette } from "@/theme";
import { Icon, type IconName, icons } from "./icon";
import { Mosaic } from "./mosaic";
import { Text } from "./text";

const ART = 80;

/** The web's CollectionListItem: 80pt mosaic, 18pt semibold name, muted
 * count, optional "dynamic" tag. Used for shelves and collections alike. */
export function CollectionRow({
	href,
	name,
	covers,
	subtitle,
	dynamicLabel,
	fallbackIcon,
	onLongPress,
}: {
	onLongPress?: () => void;
	fallbackIcon?: IconName;
	href: Href;
	name: string;
	covers: string[];
	subtitle: string;
	dynamicLabel?: string | null;
}) {
	const palette = usePalette();
	return (
		<PressableLink
			android_ripple={{ color: palette.ripple }}
			href={href}
			onLongPress={onLongPress}
			accessibilityRole="button"
			accessibilityLabel={`${name}, ${subtitle}`}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: 20,
				minHeight: 112,
				// Full-bleed list row: the padding lines the mosaic up with the
				// page gutter and the press state spans the screen.
				padding: space.lg,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surfaceCardHover : "transparent",
			})}
		>
			<View
				style={{
					boxShadow: shadows.card,
					borderRadius: radius.thumb,
					borderCurve: "continuous",
					overflow: "hidden",
				}}
			>
				<Mosaic
					covers={covers}
					size={ART}
					fallbackIcon={fallbackIcon}
					rounded={radius.thumb}
				/>
			</View>
			<View style={{ flex: 1, minWidth: 0, gap: 2 }}>
				<Text variant="rowTitle" numberOfLines={1}>
					{name}
				</Text>
				<Text
					variant="subhead"
					tone="secondary"
					numberOfLines={1}
					style={{ fontVariant: ["tabular-nums"] }}
				>
					{subtitle}
				</Text>
				{dynamicLabel ? (
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: space.xs,
							marginTop: space.xs,
						}}
					>
						<Icon name={icons.filter} size={12} color={palette.textSecondary} />
						<Text variant="caption" tone="secondary">
							{dynamicLabel}
						</Text>
					</View>
				) : null}
			</View>
		</PressableLink>
	);
}
