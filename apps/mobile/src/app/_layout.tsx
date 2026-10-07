import { useQueryClient } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { NavigationBar } from "expo-navigation-bar";
import { router } from "expo-router";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from "expo-router/react-navigation";
import { Stack } from "expo-router/stack";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PortalProvider } from "react-native-teleport";
import { useDownloads, useExports } from "@/downloads/provider";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { applyStoredAppearance } from "@/lib/appearance";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { keepGatewayOpen } from "@/lib/gateway";
import { useLocale } from "@/lib/i18n";
import { forgetSavedQueries, keepQueriesSaved } from "@/lib/query-persist";
import { shouldSnapshot } from "@/lib/query-snapshot";
import { takeResumeRoute } from "@/lib/resume-route";
import { usePlayer } from "@/player/provider";
import {
	AppProvider,
	useConnection,
	useMaybeConnection,
} from "@/providers/app-provider";
import { ReaderPool } from "@/reader/reader-pool";
import { fontSources, palettes } from "@/theme";

SplashScreen.preventAutoHideAsync();
applyStoredAppearance();

const SETUP_ROUTES = [
	"setup/server",
	"setup/library",
	"setup/upload",
	"server-address",
];
const SETUP_OPTIONS = {
	presentation: "fullScreenModal",
	animation: "slide_from_bottom",
	gestureEnabled: false,
} as const;

export default function RootLayout() {
	const scheme = useColorScheme();
	const [fontsLoaded] = useFonts(fontSources);
	const locale = useLocale();
	const base = scheme === "dark" ? DarkTheme : DefaultTheme;
	const palette = scheme === "dark" ? palettes.dark : palettes.light;
	// Navigation chrome takes the same canvas as the screens, so a push never
	// flashes the library's default white/black between two graphite screens.
	const theme = {
		...base,
		colors: {
			...base.colors,
			background: palette.background,
			card: palette.background,
			text: palette.text,
			border: palette.separator,
			primary: palette.accent,
		},
	};

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ThemeProvider value={theme}>
				<AppProvider>
					<StatusBar style="auto" />
					{/* The app's default; only the focused reader hides it. */}
					<NavigationBar hidden={false} />
					{/* Every screen reads its strings while rendering, so a new
					    language remounts the navigation (playback and cache stay). */}
					{/* Lets the pooled reader page move into the reader screen. */}
					<PortalProvider>
						{fontsLoaded ? <RootNavigator key={locale} /> : null}
					</PortalProvider>
				</AppProvider>
			</ThemeProvider>
		</GestureHandlerRootView>
	);
}

function RootNavigator() {
	const connection = useMaybeConnection();
	if (!connection) return <Navigator signedIn={false} ready />;
	return <SessionNavigator auth={connection.auth} />;
}

function SessionNavigator({ auth }: { auth: NanahoshiAuth }) {
	const { data, isPending } = auth.useSession();
	return (
		<>
			{/* Signing out must not leave someone else's book or screens behind. */}
			{!data && !isPending ? <EndSession /> : null}
			{data ? <StayOnline /> : null}
			{data ? (
				<ReaderPool key={data.user.id} userId={data.user.id}>
					<Navigator signedIn ready={!isPending} />
				</ReaderPool>
			) : (
				<Navigator signedIn={false} ready={!isPending} />
			)}
		</>
	);
}

function Navigator({ signedIn, ready }: { signedIn: boolean; ready: boolean }) {
	// Hold the splash until we know which side of the sign-in door we're on,
	// so a signed-in cold start never flashes the sign-in screen.
	if (!ready) return null;

	return (
		<>
			<HideSplash />
			<Stack screenOptions={{ headerShown: false }}>
				<Stack.Protected guard={signedIn}>
					<Stack.Screen name="(tabs)" />
					{/* The expanded player rises from the mini player. iOS: a page
					    sheet the system swipes down, as in Music and Podcasts.
					    Android: dragged down by the player itself, over the app. */}
					<Stack.Screen
						name="player"
						options={
							process.env.EXPO_OS === "ios"
								? { presentation: "modal", gestureEnabled: true }
								: {
										// Transparent so the app shows through while it's dragged down.
										presentation: "transparentModal",
										animation: "slide_from_bottom",
										contentStyle: { backgroundColor: "transparent" },
									}
						}
					/>
					{/* A cover up close: fades over the page, dragged down to close. */}
					<Stack.Screen
						name="cover"
						options={{
							presentation: "transparentModal",
							animation: "fade",
							gestureEnabled: false,
							contentStyle: { backgroundColor: "transparent" },
						}}
					/>
					{/* Guided setup (server, library, upload): full screen, one
					    question at a time; each flow steps back on its own. */}
					{SETUP_ROUTES.map((name) => (
						<Stack.Screen key={name} name={name} options={SETUP_OPTIONS} />
					))}
					{/* Enters like any other screen; no swipe-back: horizontal swipes
					    turn pages. */}
					<Stack.Screen
						name="reader/[uuid]"
						options={{ gestureEnabled: false }}
					/>
				</Stack.Protected>
				<Stack.Protected guard={!signedIn}>
					<Stack.Screen name="(auth)" />
				</Stack.Protected>
				{/* Invite links open here signed in or out. */}
				<Stack.Screen name="invite" options={SETUP_OPTIONS} />
			</Stack>
			{/* Signed out too: an invite reopens after switching servers. */}
			<ResumeRoute />
		</>
	);
}

/** Puts the user back where a remount (language change, sign-in, server
 * switch) took them from. */
function ResumeRoute() {
	useMountEffect(() => {
		const route = takeResumeRoute();
		if (!route) return;
		const frame = requestAnimationFrame(() => {
			for (const [index, href] of route.entries()) {
				if (index === 0) router.navigate(href);
				else router.push(href);
			}
		});
		return () => cancelAnimationFrame(frame);
	});
	return null;
}

function StayOnline() {
	const { serverUrl, auth } = useConnection();
	const queryClient = useQueryClient();
	useMountEffect(() =>
		keepGatewayOpen({ serverUrl, getCookie: () => auth.getCookie() }),
	);
	useMountEffect(() => keepQueriesSaved(queryClient, serverUrl));
	return null;
}

function EndSession() {
	const { serverUrl } = useConnection();
	const queryClient = useQueryClient();
	const player = usePlayer();
	const downloads = useDownloads();
	const exports = useExports();
	useMountEffect(() => {
		void player.stop();
		downloads.cancelAll();
		exports.dismiss();
		// The next account on this phone must not open on these screens.
		forgetSavedQueries(serverUrl);
		queryClient.removeQueries({
			predicate: (query) =>
				shouldSnapshot(query) && query.getObserversCount() === 0,
		});
	});
	return null;
}

function HideSplash() {
	useMountEffect(() => {
		SplashScreen.hide();
	});
	return null;
}
