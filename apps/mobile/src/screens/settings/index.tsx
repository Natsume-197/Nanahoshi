import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
import type { ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { icons } from "@/components/icon";
import { Pressable } from "@/components/pressable";
import { ServerAvatar } from "@/components/server-avatar";
import { Text } from "@/components/text";
import { clearDownloads } from "@/downloads/files";
import { useSmartDownloads } from "@/downloads/smart-settings";
import { useAppearancePreference } from "@/lib/appearance";
import { useDeveloperMode } from "@/lib/developer-mode";
import { getLanguagePreference, t } from "@/lib/i18n";
import { useLastServer } from "@/lib/last-server";
import { mediaUrl } from "@/lib/media";
import { IS_ANDROID } from "@/lib/platform";
import { LANGUAGE_NAMES } from "@/lib/preferences";
import { useSimulatedOffline } from "@/lib/simulated-offline";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi, useConnection } from "@/providers/app-provider";
import { space, usePalette } from "@/theme";

const ART = 64;

const APPEARANCE_LABELS = {
	system: () => t("settings.appearance.theme_system"),
	light: () => t("settings.appearance.theme_light"),
	dark: () => t("settings.appearance.theme_dark"),
	amoled: () => t("mobile.settings.theme_amoled"),
};

/** The web's personal settings as a native settings list: who you are on
 * top, then account, preferences and about. Server administration stays on
 * the web. */
export function SettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const appearance = useAppearancePreference();
	const language = getLanguagePreference();
	const developer = useDeveloperMode();
	const smart = useSmartDownloads();
	const offline = useSimulatedOffline();
	const { auth } = useConnection();
	return (
		<>
			{/* Material's center-aligned top app bar. */}
			{IS_ANDROID ? (
				<Stack.Screen options={{ headerTitleAlign: "center" }} />
			) : null}
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					paddingBottom: space.lg + miniPlayerInset,
				}}
			>
				<View style={{ paddingVertical: space.xs }}>
					<ProfileCard />
					<ServerCard />
				</View>
				{/* The profile card above already heads this group; a "Cuenta" title
			    over a "Cuenta" row read twice. */}
				<GroupedList>
					<GroupedRow
						first
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
				<GroupedList>
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
					<GroupedRow
						icon={icons.download}
						label={t("mobile.downloads.title")}
						value={
							smart ? t("mobile.smart.on_short") : t("mobile.smart.off_short")
						}
						href="/settings/downloads"
					/>
				</GroupedList>
				<GroupedList>
					<GroupedRow
						first
						icon={icons.info}
						label={t("settings.nav.about")}
						href="/settings/about"
					/>
					<GroupedRow
						icon={icons.tasks}
						label={t("settings.nav.tasks")}
						href="/tasks"
					/>
					{developer ? (
						<GroupedRow
							icon={icons.code}
							label={t("mobile.settings.developer")}
							value={offline ? t("mobile.settings.offline_on") : undefined}
							href="/settings/developer"
						/>
					) : null}
				</GroupedList>
				<GroupedList>
					<GroupedRow
						first
						icon={icons.signOut}
						label={t("nav.sign_out")}
						destructive
						onPress={() => void auth.signOut().then(clearDownloads)}
					/>
				</GroupedList>
				<SignedInAs />
			</ScrollView>
		</>
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
		<Card
			onPress={() => router.push("/settings/profile")}
			accessibilityLabel={t("settings.nav.profile")}
			title={name}
			subtitle={username ? `@${username}` : undefined}
			art={
				<View
					style={{
						width: ART,
						height: ART,
						borderRadius: ART / 2,
						overflow: "hidden",
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: palette.separator,
					}}
				>
					{avatar ? (
						<Image
							source={{ uri: avatar }}
							style={{ width: ART, height: ART }}
							contentFit="cover"
						/>
					) : (
						<Text variant="title">{name.slice(0, 1).toUpperCase()}</Text>
					)}
				</View>
			}
		/>
	);
}

/** The server you're in, under who you are; tapping lists the others. */
function ServerCard() {
	const { auth, serverUrl } = useConnection();
	const active = auth.useActiveOrganization();
	// Offline the server can't be asked; the last one seen stands in.
	const last = useLastServer(serverUrl);
	const server = active.data ?? last;
	const name = server?.name ?? t("server.select");
	return (
		<Card
			onPress={() => router.push("/settings/servers")}
			accessibilityLabel={`${t("mobile.me.server")}: ${name}`}
			title={name}
			subtitle={t("mobile.me.server")}
			art={
				<ServerAvatar
					name={name}
					logo={mediaUrl(serverUrl, server?.logo)}
					size={ART}
				/>
			}
		/>
	);
}

/** Who is signed in and which build, quietly at the end, as Fable closes its
 * settings. */
function SignedInAs() {
	const { auth } = useConnection();
	const session = auth.useSession();
	const email = session.data?.user.email;
	return (
		<View
			style={{
				alignItems: "center",
				gap: space.xs,
				paddingTop: space.xl,
				paddingHorizontal: space.lg,
			}}
		>
			{email ? (
				<Text variant="subhead" tone="secondary" selectable>
					{email}
				</Text>
			) : null}
			<Text variant="caption" tone="tertiary">
				{`Nanahoshi ${Platform.OS === "ios" ? "iOS" : "Android"} • ${Constants.expoConfig?.version ?? ""}`}
			</Text>
		</View>
	);
}

/** Who you are and where: drawn as Collections draws its lists (large art,
 * bold name, one quiet line), so it reads apart from the icon rows below. */
function Card({
	onPress,
	accessibilityLabel,
	art,
	title,
	subtitle,
}: {
	onPress: () => void;
	accessibilityLabel: string;
	art: ReactNode;
	title: string;
	subtitle?: string;
}) {
	const palette = usePalette();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: 20,
				paddingHorizontal: space.lg,
				paddingVertical: space.md,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surfaceCardHover : "transparent",
			})}
		>
			{art}
			<View style={{ flex: 1, minWidth: 0, gap: 2 }}>
				<Text variant="rowTitle" numberOfLines={1}>
					{title}
				</Text>
				{subtitle ? (
					<Text variant="subhead" tone="secondary" numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
		</Pressable>
	);
}
