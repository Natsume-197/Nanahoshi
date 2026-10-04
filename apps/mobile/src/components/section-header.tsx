import type { Href } from "expo-router";
import { Pressable, View } from "react-native";
import { PressableLink } from "@/components/pressable-link";
import { space, usePalette } from "@/theme";
import { Icon, icons } from "./icon";
import { Text } from "./text";

export function SectionHeader({
	title,
	href,
	onPress,
	gutter = space.lg,
}: {
	gutter?: number;
	title: string;
	href?: Href;
	/** In-page "view more" (switch a tab) instead of navigating. */
	onPress?: () => void;
}) {
	const palette = usePalette();
	const content = (
		<View
			style={{
				flexDirection: "row",
				alignItems: "center",
				gap: space.xs,
				paddingHorizontal: gutter,
				minHeight: 44,
			}}
		>
			<Text
				variant="section"
				accessibilityRole="header"
				numberOfLines={1}
				style={{ flexShrink: 1 }}
			>
				{title}
			</Text>
			{href || onPress ? (
				<Icon
					name={icons.chevronRight}
					size={18}
					color={palette.textSecondary}
				/>
			) : null}
		</View>
	);
	if (onPress) {
		return (
			<Pressable
				accessibilityRole="button"
				onPress={onPress}
				style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
			>
				{content}
			</Pressable>
		);
	}
	if (!href) return content;
	return (
		<PressableLink
			href={href}
			style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
		>
			{content}
		</PressableLink>
	);
}
