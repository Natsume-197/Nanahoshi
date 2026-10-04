import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { PressableLink } from "@/components/pressable-link";
import { IS_ANDROID } from "@/lib/platform";
import { space, usePalette } from "@/theme";
import { Text } from "./text";

/**
 * Library/search row: 56pt artwork, title, one secondary line. Rows highlight
 * their background on press (never scale) — a list reads as one surface.
 */
export function MediaRow({
	href,
	artwork,
	title,
	subtitle,
	trailing,
}: {
	href: Href;
	artwork: ReactNode;
	title: string;
	subtitle?: string | null;
	trailing?: ReactNode;
}) {
	const palette = usePalette();
	return (
		<PressableLink
			android_ripple={{ color: palette.ripple }}
			href={href}
			accessibilityRole="button"
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				paddingHorizontal: space.lg,
				paddingVertical: space.sm,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surface : "transparent",
			})}
		>
			{artwork}
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="headline" numberOfLines={2}>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="subhead" tone="secondary" numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{trailing}
		</PressableLink>
	);
}
