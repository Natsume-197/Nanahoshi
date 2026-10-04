import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { Icon, icons } from "@/components/icon";
import { Text } from "@/components/text";
import { useAppearancePreference } from "@/lib/appearance";
import { getLanguagePreference, t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { LANGUAGE_NAMES } from "@/lib/preferences";
import { useApi, useConnection } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";

const APPEARANCE_LABELS = {
	system: () => t("settings.appearance.theme_system"),
	light: () => t("settings.appearance.theme_light"),
	dark: () => t("settings.appearance.theme_dark"),
};

/** The web's personal settings as a native settings list: who you are on
 * top, then account, preferences and about. Server administration stays on
 * the web. */
export function SettingsScreen() {
	const appearance = useAppearancePreference();
	const language = getLanguagePreference();
	return (
		<ScrollView
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{ padding: space.lg, gap: space.xl }}
		>
			<ProfileCard />
			<GroupedList title={t("settings.group.account")}>
				<GroupedRow
					first
					icon={icons.account}
					label={t("settings.nav.profile")}
					href="/settings/profile"
				/>
				<GroupedRow
					icon={icons.link}
					label={t("settings.nav.account")}
					href="/settings/account"
				/>
				<GroupedRow
					icon={icons.privacy}
					label={t("settings.nav.privacy")}
					href="/settings/privacy"
				/>
			</GroupedList>
			<GroupedList title={t("settings.group.preferences")}>
				<GroupedRow
					first
					icon={icons.appearance}
					label={t("settings.nav.appearance")}
					value={APPEARANCE_LABELS[appearance]()}
					href="/settings/appearance"
				/>
				<GroupedRow
					icon={icons.globe}
					label={t("settings.nav.language")}
					value={
						language === "system"
							? t("mobile.settings.language_system")
							: LANGUAGE_NAMES[language]
					}
					href="/settings/language"
				/>
			</GroupedList>
			<GroupedList>
				<GroupedRow
					first
					icon={icons.info}
					label={t("settings.nav.about")}
					href="/settings/about"
				/>
			</GroupedList>
		</ScrollView>
	);
}

function ProfileCard() {
	const { orpc } = useApi();
	const { serverUrl } = useConnection();
	const palette = usePalette();
	const profile = useQuery(orpc.profile.getProfile.queryOptions());
	const username =
		profile.data?.displayUsername ?? profile.data?.username ?? "";
	const name = profile.data?.name?.trim() || username;
	const avatar = mediaUrl(serverUrl, profile.data?.image);
	return (
		<Pressable
			onPress={() => router.push("/settings/profile")}
			accessibilityRole="button"
			accessibilityLabel={t("settings.nav.profile")}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				padding: space.lg,
				borderRadius: radius.card,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor:
					pressed && process.env.EXPO_OS === "ios"
						? palette.surfaceCardHover
						: palette.surfaceCard,
			})}
		>
			<View
				style={{
					width: 56,
					height: 56,
					borderRadius: 28,
					overflow: "hidden",
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: palette.separator,
				}}
			>
				{avatar ? (
					<Image
						source={{ uri: avatar }}
						style={{ width: 56, height: 56 }}
						contentFit="cover"
					/>
				) : (
					<Text variant="title">{name.slice(0, 1).toUpperCase()}</Text>
				)}
			</View>
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="headline" numberOfLines={1}>
					{name}
				</Text>
				{username ? (
					<Text variant="subhead" tone="secondary" numberOfLines={1}>
						@{username}
					</Text>
				) : null}
			</View>
			<Icon name={icons.chevronRight} size={16} color={palette.textSecondary} />
		</Pressable>
	);
}
