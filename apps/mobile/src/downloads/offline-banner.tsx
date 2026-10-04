import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { radius, space, usePalette } from "@/theme";

/** Home without a server: say so, and point at what still works. */
export function OfflineBanner() {
	const palette = usePalette();
	return (
		<View
			style={{
				marginHorizontal: space.lg,
				marginTop: space.md,
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				padding: space.md,
				borderRadius: radius.card,
				borderCurve: "continuous",
				backgroundColor: palette.surfaceCard,
			}}
		>
			<Icon name={icons.offline} size={22} color={palette.textSecondary} />
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="headline">{t("mobile.downloads.offline_title")}</Text>
				<Text variant="subhead" tone="secondary">
					{t("mobile.downloads.offline_desc")}
				</Text>
			</View>
			<Pressable
				accessibilityRole="button"
				onPress={() => router.push("/downloads")}
				style={({ pressed }) => ({
					height: 36,
					paddingHorizontal: space.lg,
					borderRadius: radius.pill,
					justifyContent: "center",
					backgroundColor: palette.surface,
					opacity: pressed ? 0.7 : 1,
				})}
			>
				<Text variant="subhead" style={{ fontWeight: "600" }}>
					{t("mobile.downloads.offline_action")}
				</Text>
			</Pressable>
		</View>
	);
}
