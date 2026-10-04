import { router } from "expo-router";
import { Stack } from "expo-router/stack";
import { View } from "react-native";
import { NoticeHost } from "@/components/prompt/host";
import { ExportProgressBar } from "@/downloads/export-progress-bar";
import { t } from "@/lib/i18n";
import { HAS_TAB_ACCESSORY } from "@/lib/platform";
import { MiniPlayer } from "@/player/mini-player";
import { fonts, radius, usePalette } from "@/theme";

const ROOT_TITLES: Record<string, () => string> = {
	index: () => t("nav.home"),
	search: () => t("common.search"),
	collections: () => t("nav.collections"),
	library: () => t("mobile.library.title"),
	me: () => t("nav.me"),
};

/**
 * One stack per tab, all sharing the detail routes, so a book opened from
 * Search stays in Search's history and the tab bar stays put.
 */
export default function TabStack({ segment }: { segment: string }) {
	const palette = usePalette();
	const ios = process.env.EXPO_OS === "ios";
	const root = segment.match(/\((.*)\)/)?.[1] ?? "index";
	// Quick tasks over the page (add to list, create or edit a collection):
	// one native sheet, half height first, full on drag.
	const listSheet = {
		presentation: "formSheet" as const,
		title: "",
		headerShown: false,
		sheetGrabberVisible: true,
		sheetAllowedDetents: [0.6, 1],
		sheetCornerRadius: radius.sheet,
		contentStyle: { backgroundColor: palette.background },
	};

	return (
		// The mini player sits under each tab's stack, so it rests right on top
		// of the native tab bar and every screen ends above it.
		<View style={{ flex: 1, backgroundColor: palette.background }}>
			<Stack
				screenOptions={{
					unstable_headerRightItems: ios
						? () => [
								{
									type: "button",
									label: t("server.select"),
									icon: { type: "sfSymbol", name: "server.rack" },
									onPress: () => router.push("/servers"),
								},
								{
									type: "button",
									label: t("aria.friends_activity"),
									icon: { type: "sfSymbol", name: "person.2" },
									onPress: () => router.push("/friends"),
								},
								{
									type: "button",
									label: t("notifications.title"),
									icon: { type: "sfSymbol", name: "bell" },
									onPress: () => router.push("/notifications"),
								},
							]
						: undefined,
					headerShadowVisible: false,
					headerBackButtonDisplayMode: "minimal",
					headerTintColor: palette.text,
					headerStyle: { backgroundColor: palette.background },
					headerTitleStyle: {
						color: palette.text,
						fontFamily: ios ? undefined : fonts["600"],
					},
					headerLargeTitleStyle: {
						color: palette.text,
						fontFamily: ios ? undefined : fonts["700"],
					},
					contentStyle: { backgroundColor: palette.background },
				}}
			>
				<Stack.Screen
					name={root}
					options={{
						title: ROOT_TITLES[root]?.() ?? "",
						// iOS owns the navigation title; Android keeps its web-style heading.
						headerShown: ios,
						// Keep the compact native title so the first category/control
						// starts directly below the toolbar instead of below a second
						// large-title region.
						headerLargeTitle: false,
					}}
				/>
				{/* Detail pages float their hero under a transparent bar. */}
				<Stack.Screen
					name="book/[uuid]"
					options={{
						title: "",
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
						headerShadowVisible: false,
					}}
				/>
				<Stack.Screen
					name="audiobook/[uuid]"
					options={{
						title: "",
						headerTransparent: true,
						headerStyle: { backgroundColor: "transparent" },
						headerShadowVisible: false,
					}}
				/>
				{/* Picking a server is a quick choice: a sheet. */}
				<Stack.Screen
					name="servers"
					options={{
						title: t("server.select"),
						presentation: "formSheet",
						sheetGrabberVisible: true,
						sheetAllowedDetents: [0.75, 1],
						unstable_headerRightItems: ios
							? () => [
									{
										type: "button",
										label: t("common.close"),
										icon: { type: "sfSymbol", name: "xmark" },
										onPress: () => router.back(),
									},
								]
							: undefined,
					}}
				/>
				{/* Friends and notifications are pages of their own, pushed like
				    any other screen (the web's phone layout, Storytel's too). */}
				<Stack.Screen
					name="friends"
					options={{ title: t("aria.friends_activity") }}
				/>
				<Stack.Screen
					name="notifications"
					options={{ title: t("notifications.title") }}
				/>
				<Stack.Screen name="stats" options={{ title: t("nav.stats") }} />
				<Stack.Screen
					name="downloads"
					options={{ title: t("mobile.downloads.title") }}
				/>
				<Stack.Screen
					name="settings/index"
					options={{ title: t("nav.settings") }}
				/>
				<Stack.Screen
					name="settings/profile"
					options={{ title: t("settings.nav.profile") }}
				/>
				<Stack.Screen
					name="settings/account"
					options={{ title: t("settings.nav.account") }}
				/>
				<Stack.Screen
					name="settings/privacy"
					options={{ title: t("settings.nav.privacy") }}
				/>
				<Stack.Screen
					name="settings/appearance"
					options={{ title: t("settings.nav.appearance") }}
				/>
				<Stack.Screen
					name="settings/language"
					options={{ title: t("settings.nav.language") }}
				/>
				<Stack.Screen
					name="settings/about"
					options={{ title: t("settings.nav.about") }}
				/>
				<Stack.Screen name="series/[uuid]" />
				<Stack.Screen name="author/[uuid]" />
				<Stack.Screen name="collection/[id]" />
				<Stack.Screen name="genre/[uuid]" />
				{/* Creating and editing a collection: the same native sheet as
				    "Add to list"; swiping down cancels. */}
				<Stack.Screen name="collection/new" options={listSheet} />
				<Stack.Screen name="collection/edit/[id]" options={listSheet} />
				{/* The rules editor needs the whole screen. */}
				<Stack.Screen
					name="collection/dynamic/new"
					options={{ presentation: "modal" }}
				/>
				<Stack.Screen
					name="collection/dynamic/[id]"
					options={{ presentation: "modal" }}
				/>
				{/* Shelf + lists picker: a native sheet over the detail page. */}
				<Stack.Screen name="add-to-list/[uuid]" options={listSheet} />
			</Stack>
			<ExportProgressBar />
			{HAS_TAB_ACCESSORY ? null : <MiniPlayer />}
			<NoticeHost />
		</View>
	);
}
