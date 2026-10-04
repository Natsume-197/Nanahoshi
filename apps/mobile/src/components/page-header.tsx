import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "@/theme";
import { Text } from "./text";

/**
 * The web's CollectionToolbar title at the top of a tab root. Tab roots draw
 * their own title instead of the native bar so Android and iOS get the same
 * big, left-aligned heading the web shows (a native Android toolbar only
 * offers a small title). `default` is text-3xl bold (Library); `compact` is
 * text-2xl semibold (Collections, Search).
 */
export function PageHeader({
	title,
	size = "compact",
	subtitle,
	trailing,
	inset = true,
}: {
	title: string;
	size?: "default" | "compact";
	subtitle?: string | null;
	trailing?: ReactNode;
	/** Pad for the status bar (false when something sits above it). */
	inset?: boolean;
}) {
	const insets = useSafeAreaInsets();
	if (process.env.EXPO_OS === "ios" && !subtitle && !trailing) return null;
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "flex-end",
				gap: space.lg,
				paddingTop: (inset ? insets.top : 0) + space.lg,
				paddingHorizontal: space.lg,
				paddingBottom: space.xs,
			}}
		>
			<View style={{ flex: 1, gap: 6 }}>
				<Text
					variant={size === "default" ? "largeTitle" : "pageTitle"}
					accessibilityRole="header"
					numberOfLines={2}
				>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="subhead" tone="secondary">
						{subtitle}
					</Text>
				) : null}
			</View>
			{trailing}
		</View>
	);
}
