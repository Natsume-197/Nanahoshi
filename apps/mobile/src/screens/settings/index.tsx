import Constants from "expo-constants";
import type { Href } from "expo-router";
import { type ReactNode, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { GroupedRow } from "@/components/grouped-list";
import { type IconName, icons } from "@/components/icon";
import { SearchField } from "@/components/search-field";
import { ServerAvatar } from "@/components/server-avatar";
import { EmptyState } from "@/components/states";
import { Text } from "@/components/text";
import { clearDownloads } from "@/downloads/files";
import { useSmartDownloads } from "@/downloads/smart-settings";
import { useAppearancePreference } from "@/lib/appearance";
import { useDeveloperMode } from "@/lib/developer-mode";
import { getLanguagePreference, t } from "@/lib/i18n";
import { useLastServer } from "@/lib/last-server";
import { mediaUrl } from "@/lib/media";
import { LANGUAGE_NAMES } from "@/lib/preferences";
import { useSimulatedOffline } from "@/lib/simulated-offline";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useConnection } from "@/providers/app-provider";
import { space } from "@/theme";
import { filterSections } from "./settings-search";

const APPEARANCE_LABELS = {
	system: () => t("settings.appearance.theme_system"),
	light: () => t("settings.appearance.theme_light"),
	dark: () => t("settings.appearance.theme_dark"),
	amoled: () => t("mobile.settings.theme_amoled"),
};

type SettingsRow = {
	key: string;
	label: string;
	icon?: IconName;
	leading?: ReactNode;
	value?: string;
	href: Href;
};

/** Personal settings as plain sections under a search field: account, app,
 * tools, about, then sign out on its own. Server administration stays on the
 * web. */
export function SettingsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const appearance = useAppearancePreference();
	const language = getLanguagePreference();
	const developer = useDeveloperMode();
	const smart = useSmartDownloads();
	const offline = useSimulatedOffline();
	const server = useServerSummary();
	const { auth } = useConnection();
	const [query, setQuery] = useState("");

	const sections: { key: string; title: string; rows: SettingsRow[] }[] = [
		{
			key: "account",
			title: t("mobile.settings.section_account"),
			rows: [
				{
					key: "profile",
					icon: icons.account,
					label: t("user_profile.edit_profile"),
					href: "/settings/profile",
				},
				{
					key: "account",
					icon: icons.link,
					label: t("settings.nav.account"),
					href: "/settings/account",
				},
				{
					key: "privacy",
					icon: icons.privacy,
					label: t("settings.nav.privacy"),
					href: "/settings/privacy",
				},
				{
					key: "server",
					leading: server.avatar,
					label: t("mobile.me.server"),
					value: server.name,
					href: "/settings/servers",
				},
			],
		},
		{
			key: "app",
			title: t("mobile.settings.section_app"),
			rows: [
				{
					key: "appearance",
					icon: icons.appearance,
					label: t("settings.nav.appearance"),
					value: APPEARANCE_LABELS[appearance](),
					href: "/settings/appearance",
				},
				{
					key: "language",
					icon: icons.globe,
					label: t("settings.nav.language"),
					value:
						language === "system"
							? t("mobile.settings.language_system")
							: LANGUAGE_NAMES[language],
					href: "/settings/language",
				},
				{
					key: "downloads",
					icon: icons.download,
					label: t("mobile.downloads.title"),
					value: smart
						? t("mobile.smart.on_short")
						: t("mobile.smart.off_short"),
					href: "/settings/downloads",
				},
			],
		},
		{
			key: "tools",
			title: t("mobile.settings.section_tools"),
			rows: [
				{
					key: "tasks",
					icon: icons.tasks,
					label: t("settings.nav.tasks"),
					href: "/tasks",
				},
				...(developer
					? [
							{
								key: "developer",
								icon: icons.code,
								label: t("mobile.settings.developer"),
								value: offline ? t("mobile.settings.offline_on") : undefined,
								href: "/settings/developer" as Href,
							},
						]
					: []),
			],
		},
		{
			key: "more",
			title: t("mobile.settings.section_more"),
			rows: [
				{
					key: "about",
					icon: icons.info,
					label: t("settings.nav.about"),
					href: "/settings/about",
				},
			],
		},
	];
	const shown = filterSections(sections, query);
	const searching = query.trim().length > 0;

	return (
		<ScrollView
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				paddingTop: space.sm,
				paddingBottom: space.lg + miniPlayerInset,
			}}
		>
			<View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
				<SearchField
					placeholder={t("common.search")}
					onQuery={setQuery}
					delay={0}
				/>
			</View>
			{shown.map((section) => (
				<View key={section.key} style={{ paddingTop: space.lg }}>
					<Text
						variant="subhead"
						tone="secondary"
						accessibilityRole="header"
						style={{ paddingHorizontal: space.lg, paddingBottom: space.xs }}
					>
						{section.title}
					</Text>
					{section.rows.map((row) => (
						<GroupedRow
							key={row.key}
							icon={row.icon}
							leading={row.leading}
							label={row.label}
							value={row.value}
							href={row.href}
						/>
					))}
				</View>
			))}
			{searching && shown.length === 0 ? (
				<EmptyState
					icon={icons.search}
					title={t("search.no_results_title", { query: query.trim() })}
				/>
			) : null}
			{searching ? null : (
				<View style={{ paddingTop: space.xl }}>
					<GroupedRow
						icon={icons.signOut}
						label={t("nav.sign_out")}
						destructive
						onPress={() => void auth.signOut().then(clearDownloads)}
					/>
					<SignedInAs />
				</View>
			)}
		</ScrollView>
	);
}

/** The server you're in: its logo and name, or the last one seen offline. */
function useServerSummary() {
	const { auth, serverUrl } = useConnection();
	const active = auth.useActiveOrganization();
	const last = useLastServer(serverUrl);
	const server = active.data ?? last;
	const name = server?.name ?? t("server.select");
	return {
		name,
		avatar: (
			<ServerAvatar
				name={name}
				logo={mediaUrl(serverUrl, server?.logo)}
				size={24}
			/>
		),
	};
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
