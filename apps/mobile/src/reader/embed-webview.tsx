import {
	createReaderHost,
	hostBootScript,
	hostDeliveryScript,
	READER_BRIDGE_PROTOCOL,
	type ReaderAudioState,
	type ReaderBootScreen,
	type ReaderInsets,
	type ReadListenBarState,
} from "@nanahoshi/reader-bridge";
import { useQueryClient } from "@tanstack/react-query";
import { NavigationBar } from "expo-navigation-bar";
import { router, useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { AppState, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { ensureBookFile } from "@/downloads/files";
import { useDownloads } from "@/downloads/provider";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { locale } from "@/lib/i18n";
import { usePlayer } from "@/player/provider";
import { useConnection } from "@/providers/app-provider";
import { usePalette } from "@/theme";
import { wantsLightStatusBar } from "./chrome-color";
import { ReadListenBar } from "./read-listen-bar";
import { setActiveReadListenPair } from "./read-listen-entry";
import { onConnectedServer } from "./server-url";
import { routeForWebHref } from "./web-routes";

/**
 * The web reader's page (apps/reader-embed) in a WebView: the reader itself or
 * the reading statistics. This side is its host: it answers the page's oRPC
 * calls with the app's authenticated client and hands the reader its book
 * from disk, so a downloaded book opens without a network.
 */
export function EmbedWebView({
	screen,
	userId,
	serverId,
	page,
	fullScreen,
}: {
	screen: ReaderBootScreen;
	userId: string;
	serverId: string;
	page: { pageUri: string; readableRoot: string };
	/** The reader draws under the system bars; stats sits below a header. */
	fullScreen: boolean;
}) {
	const { auth, api, serverUrl } = useConnection();
	const player = usePlayer();
	const downloads = useDownloads();
	const queryClient = useQueryClient();
	const palette = usePalette();
	const scheme = useColorScheme();
	const insets = useSafeAreaInsets();
	// Hidden system bars report zero insets. The page keeps the ones from while
	// they showed, so opening the menu never reflows the book.
	const [immersive, setImmersive] = useState(false);
	// A route opened from the reader (a link, the player) stacks on top of it
	// while it stays mounted; the bars come back for that screen.
	const focused = useIsFocused();
	const hideBars = immersive && focused;
	// Read through refs: the bridge callbacks are created once, on mount.
	const insetsRef = useRef(insets);
	if (!immersive) insetsRef.current = insets;
	const webview = useRef<WebView>(null);
	const [lightStatusBar, setLightStatusBar] = useState(scheme === "dark");
	// Read & Listen's controls, shown in a native bar under the page.
	const [bar, setBar] = useState<ReadListenBarState | null>(null);
	const barRef = useRef(bar);
	barRef.current = bar;
	// The page only hears the player once Read & Listen asked for it.
	const narrating = useRef(false);
	const toInsets = (): ReaderInsets => {
		const current = insetsRef.current;
		return {
			top: fullScreen ? current.top : 0,
			right: current.right,
			// The bar pads for the home indicator itself.
			bottom: fullScreen && !barRef.current ? current.bottom : 0,
			left: current.left,
		};
	};
	const deliver = (message: Parameters<typeof hostDeliveryScript>[0]) =>
		webview.current?.injectJavaScript(hostDeliveryScript(message));
	const lastAudio = useRef("");
	const pushAudioState = () => {
		if (!narrating.current) return;
		const snapshot = player.getSnapshot();
		const state: ReaderAudioState = {
			audiobookUuid: snapshot.book?.uuid ?? null,
			isPlaying: snapshot.playing,
			playbackRate: snapshot.rate,
			globalCurrentTime: snapshot.time,
		};
		const key = JSON.stringify(state);
		if (key === lastAudio.current) return;
		lastAudio.current = key;
		deliver({ type: "audio-state", state });
	};

	const [bootScript] = useState(() =>
		hostBootScript({
			protocol: READER_BRIDGE_PROTOCOL,
			screen,
			userId,
			serverId,
			serverUrl,
			locale,
			colorScheme: scheme === "dark" ? "dark" : "light",
			insets: toInsets(),
		}),
	);

	const [host] = useState(() =>
		createReaderHost({
			client: api.client,
			overrides: {
				"files.getReaderUrl": async (input) => {
					const request = input as { uuid: string; serverId: string };
					const filename =
						(screen.kind === "reader" ? screen.book.filename : null) ??
						`${request.uuid}.epub`;
					const file = await ensureBookFile({
						serverId: request.serverId,
						uuid: request.uuid,
						filename,
						cookie: await auth.getCookie(),
						resolveUrl: async () =>
							onConnectedServer(
								(await api.client.files.getReaderUrl(request)).url,
								serverUrl,
							),
					});
					if (screen.kind === "reader" && request.uuid === screen.uuid)
						downloads.recordOpenedBook(
							request.serverId,
							request.uuid,
							screen.book,
						);
					return { url: file.uri, filename };
				},
			},
			deliver: (message) => deliver(message),
			onMessage: (message) => {
				switch (message.type) {
					case "navigate": {
						// Leaving the reader returns to the book it was opened from.
						const backToBook =
							screen.kind === "reader" &&
							message.href === `/dashboard/books/${screen.uuid}`;
						if ((backToBook || message.href === "back") && router.canGoBack())
							return router.back();
						const route = routeForWebHref(message.href);
						if (route) router.push(route);
						return;
					}
					case "play-audiobook":
						void player.play(message.uuid);
						return;
					case "audio":
						narrating.current = true;
						if (message.command === "load")
							void player
								.play(message.audiobookUuid, { autoplay: false })
								.then(pushAudioState);
						else if (message.command === "play") player.resume();
						else if (message.command === "pause") player.pause();
						else if (message.command === "seek")
							void player.seek(message.seconds);
						else if (message.command === "stop") void player.stop();
						pushAudioState();
						return;
					case "read-listen-bar":
						narrating.current = narrating.current || message.bar !== null;
						setActiveReadListenPair(
							message.bar && screen.kind === "reader"
								? message.bar.pairUuid
								: null,
						);
						barRef.current = message.bar;
						setBar(message.bar);
						deliver({ type: "insets", insets: toInsets() });
						pushAudioState();
						return;
					case "immersive":
						setImmersive(message.immersive);
						return;
					case "chrome-color":
						setLightStatusBar(
							message.color === null
								? scheme === "dark"
								: wantsLightStatusBar(message.color),
						);
						return;
					case "invalidate":
						void queryClient.invalidateQueries({
							queryKey:
								message.target === "reading-progress"
									? api.orpc.readingProgress.key()
									: api.orpc.recommendations.key(),
						});
						return;
					case "error":
						console.warn("[reader]", message.message);
						return;
				}
			},
		}),
	);

	// Backgrounding the app reads to the reader like a hidden tab: it pauses the
	// session clock and saves.
	useMountEffect(() => {
		const unsubscribe = player.subscribe(pushAudioState);
		return () => {
			unsubscribe();
		};
	});

	useMountEffect(() => {
		const subscription = AppState.addEventListener("change", (state) =>
			webview.current?.injectJavaScript(
				hostDeliveryScript({
					type: "visibility",
					state: state === "active" ? "visible" : "hidden",
				}),
			),
		);
		return () => subscription.remove();
	});

	return (
		<View
			style={{ flex: 1, backgroundColor: palette.background }}
			// Rotation and split screen change the insets; the page pads by them.
			onLayout={() => deliver({ type: "insets", insets: toInsets() })}
		>
			<StatusBar style={lightStatusBar ? "light" : "dark"} hidden={hideBars} />
			{/* Reading goes full screen, as in Play Books; the menu brings the
			    bars back. */}
			<NavigationBar hidden={hideBars} />
			<WebView
				ref={webview}
				source={{ uri: page.pageUri }}
				originWhitelist={["*"]}
				allowFileAccess
				allowFileAccessFromFileURLs
				allowUniversalAccessFromFileURLs
				allowingReadAccessToURL={page.readableRoot}
				injectedJavaScriptBeforeContentLoaded={bootScript}
				onMessage={(event) => host.handle(event.nativeEvent.data)}
				setSupportMultipleWindows={false}
				overScrollMode="never"
				bounces={false}
				webviewDebuggingEnabled={__DEV__}
				style={{ flex: 1, backgroundColor: palette.background }}
			/>
			{bar ? (
				<ReadListenBar
					bar={bar}
					onCommand={(command) =>
						deliver({ type: "read-listen-command", command })
					}
				/>
			) : null}
		</View>
	);
}
