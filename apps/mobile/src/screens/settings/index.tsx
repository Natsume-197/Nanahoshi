import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Image } from "expo-image";
import { router, Stack } from "expo-router";
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
				<IdentityHeader />
				{/* The profile card above already heads this group; a "Cuenta" title
			    over a "Cuenta" row read twice. */}
				<GroupedList>
					<ServerRow />
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

const AVATAR = 80;

/**
 * Who you are, then where: your photo and name centred, the server one quiet
 * line under them that opens the server list. The banner stays on the Profile
 * page, so opening it still feels like going somewhere.
 */
function IdentityHeader() {
	const { orpc } = useApi();
	const { serverUrl } = useConnection();
	const palette = usePalette();
	const profile = useQuery(orpc.profile.getProfile.queryOptions());
	const username =
		profile.data?.displayUsername ?? profile.data?.username ?? "";
	const name = profile.data?.name?.trim() || username;
	const avatar = mediaUrl(serverUrl, profile.data?.image);
	return (
		<View style={{ alignItems: "center", paddingBottom: space.lg }}>
			<Pressable
				onPress={() => router.push("/settings/profile")}
				accessibilityRole="button"
				accessibilityLabel={`${t("settings.nav.profile")}: ${name}`}
				style={({ pressed }) => ({
					alignItems: "center",
					gap: space.md,
					paddingTop: space.lg,
					paddingHorizontal: space.lg,
					opacity: pressed && !IS_ANDROID ? 0.7 : 1,
				})}
			>
				<View
					style={{
						width: AVATAR,
						height: AVATAR,
						borderRadius: AVATAR / 2,
						overflow: "hidden",
						alignItems: "center",
						justifyContent: "center",
						backgroundColor: palette.surface,
					}}
				>
					{avatar ? (
						<Image
							source={{ uri: avatar }}
							style={{ width: AVATAR, height: AVATAR }}
							contentFit="cover"
						/>
					) : (
						<Text variant="title">{name.slice(0, 1).toUpperCase()}</Text>
					)}
				</View>
				<View style={{ gap: 2, alignItems: "center" }}>
					<Text variant="title" numberOfLines={1}>
						{name}
					</Text>
					{username ? (
						<Text variant="subhead" tone="secondary" numberOfLines={1}>
							@{username}
						</Text>
					) : null}
				</View>
			</Pressable>
		</View>
	);
}

/** The server you're in, as a row like Appearance: its logo in the icon's
 * place, its name as the value; opens the server list. */
function ServerRow() {
	const { auth, serverUrl } = useConnection();
	const active = auth.useActiveOrganization();
	// Offline the server can't be asked; the last one seen stands in.
	const last = useLastServer(serverUrl);
	const server = active.data ?? last;
	const name = server?.name ?? t("server.select");
	return (
		<GroupedRow
			first
			leading={
				<ServerAvatar
					name={name}
					logo={mediaUrl(serverUrl, server?.logo)}
					size={24}
				/>
			}
			label={t("mobile.me.server")}
			value={name}
			href="/settings/servers"
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
