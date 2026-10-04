import {
	createReaderHost,
	type HostToReaderMessage,
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
import { type Href, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type Ref, useImperativeHandle, useRef, useState } from "react";
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
import { readerGround, rememberReaderGround } from "./reader-ground";
import { onConnectedServer } from "./server-url";
import { routeForWebHref } from "./web-routes";

// Offline, the last saves fail fast; this only bounds a page that never answers.
const CLOSE_TIMEOUT_MS = 3000;
const BACK_TIMEOUT_MS = 500;

/** Drives a reader page from the route that shows it. */
export interface ReaderWebViewHandle {
	/** Shows a screen on a page booted without one. */
	open(screen: ReaderBootScreen, serverId: string): void;
	/** The system Back: the page closes a panel, or `onLeave` runs. */
	back(onLeave: () => void): void;
	/** Unmounts the screen so the reader makes its last saves; resolves once
	 * they are answered (or after a timeout). */
	close(): Promise<void>;
	/** Whether a screen is open on the page. */
	isOpen(): boolean;
}

/**
 * The web reader's page (apps/mobile/reader-embed) in a WebView: the reader itself or
 * the reading statistics. This side is its host: it answers the page's oRPC
 * calls with the app's authenticated client and hands the reader its book
 * from disk, so a downloaded book opens without a network.
 */
export function EmbedWebView({
	screen: bootScreen,
	userId,
	serverId: bootServerId,
	page,
	fullScreen,
	onContentHeight,
	visible = true,
	handleRef,
	onLeave = (next) => (next ? router.push(next) : router.back()),
}: {
	/** Absent: the page boots ahead of time and waits for `open`. */
	screen?: ReaderBootScreen;
	userId: string;
	serverId?: string;
	page: { pageUri: string; readableRoot: string };
	/** The reader draws under the system bars; stats sits below a header. */
	fullScreen: boolean;
	/** Sized by its parent to the page, which then never scrolls itself. */
	onContentHeight?: (height: number) => void;
	/** On screen and focused: only then may it hide or tint the system bars. */
	visible?: boolean;
	handleRef?: Ref<ReaderWebViewHandle>;
	/** Leaves this screen. The global router.back() would pop a hidden screen
	 * under the reader first. */
	onLeave?: (next?: Href) => void;
}) {
	const { auth, api, serverUrl } = useConnection();
	const player = usePlayer();
	const downloads = useDownloads();
	const queryClient = useQueryClient();
	const palette = usePalette();
	const scheme = useColorScheme();
	const insets = useSafeAreaInsets();
	// What the page shows now; a page booted ahead of time learns it from open().
	const screenRef = useRef(bootScreen ?? null);
	const [shown, setShown] = useState(!!bootScreen);
	// Hidden system bars report zero insets. The page keeps the ones from while
	// they showed, so opening the menu never reflows the book.
	const [immersive, setImmersive] = useState(false);
	const hideBars = immersive && visible && shown;
	// Read through refs: the bridge callbacks are created once, on mount.
	const insetsRef = useRef(insets);
	if (!immersive) insetsRef.current = insets;
	const webview = useRef<WebView>(null);
	const [lightStatusBar, setLightStatusBar] = useState(scheme === "dark");
	const [ground] = useState(() =>
		fullScreen ? (readerGround() ?? palette.background) : palette.background,
	);
	// Read & Listen's controls, shown in a native bar under the page.
	const [bar, setBar] = useState<ReadListenBarState | null>(null);
	const barRef = useRef(bar);
	barRef.current = bar;
	// The page only hears the player once Read & Listen asked for it.
	const narrating = useRef(false);
	// Messages sent before the page installed its receiver would be lost.
	const ready = useRef(false);
	const queued = useRef<HostToReaderMessage[]>([]);
	// Closes waiting for the page; it answers each one in order.
	const closing = useRef(new Set<() => void>());
	const backed = useRef<{
		timer: ReturnType<typeof setTimeout>;
		leave: () => void;
	} | null>(null);
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
	const deliver = (message: HostToReaderMessage) => {
		if (!ready.current && message.type !== "insets") {
			queued.current.push(message);
			return;
		}
		webview.current?.injectJavaScript(hostDeliveryScript(message));
	};
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

	useImperativeHandle(handleRef, () => ({
		open(screen, serverId) {
			screenRef.current = screen;
			setShown(true);
			deliver({ type: "open", screen, serverId });
		},
		back(onLeave) {
			if (backed.current) return;
			deliver({ type: "back" });
			// A page that never answers (still booting, crashed) must not trap the user.
			backed.current = {
				leave: onLeave,
				timer: setTimeout(() => {
					backed.current = null;
					onLeave();
				}, BACK_TIMEOUT_MS),
			};
		},
		isOpen: () => screenRef.current !== null,
		close() {
			// The host forgets the screen now: a late answer must not touch a book
			// opened meanwhile, which the page will show after this one closes.
			screenRef.current = null;
			narrating.current = false;
			setShown(false);
			setImmersive(false);
			setBar(null);
			barRef.current = null;
			return new Promise<void>((resolve) => {
				const done = () => {
					clearTimeout(timeout);
					closing.current.delete(done);
					resolve();
				};
				const timeout = setTimeout(done, CLOSE_TIMEOUT_MS);
				closing.current.add(done);
				deliver({ type: "close" });
			});
		},
	}));

	const [bootScript] = useState(() =>
		hostBootScript({
			protocol: READER_BRIDGE_PROTOCOL,
			screen: bootScreen,
			userId,
			serverId: bootServerId,
			background: ground,
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
					const screen = screenRef.current;
					const filename =
						(screen?.kind === "reader" ? screen.book.filename : null) ??
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
					if (screen?.kind === "reader" && request.uuid === screen.uuid)
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
				const screen = screenRef.current;
				switch (message.type) {
					case "ready": {
						ready.current = true;
						const pending = queued.current;
						queued.current = [];
						for (const message of pending) deliver(message);
						return;
					}
					case "navigate": {
						// Leaving the reader returns to the book it was opened from.
						const backToBook =
							screen?.kind === "reader" &&
							message.href === `/dashboard/books/${screen.uuid}`;
						if (backToBook || message.href === "back") return onLeave();
						const route = routeForWebHref(message.href);
						if (!route) return;
						// A link leaves the reader, as on the web.
						if (screen?.kind === "reader") onLeave(route);
						else router.push(route);
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
							message.bar && screen?.kind === "reader"
								? message.bar.pairUuid
								: null,
						);
						barRef.current = message.bar;
						setBar(message.bar);
						deliver({ type: "insets", insets: toInsets() });
						pushAudioState();
						return;
					case "content-height":
						onContentHeight?.(message.height);
						return;
					case "immersive":
						setImmersive(message.immersive);
						return;
					case "chrome-color":
						if (message.color && screen?.kind === "reader")
							rememberReaderGround(message.color);
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
					case "back-result": {
						const pending = backed.current;
						if (!pending) return;
						clearTimeout(pending.timer);
						backed.current = null;
						if (!message.handled) pending.leave();
						return;
					}
					case "closed": {
						const [first] = closing.current;
						first?.();
						return;
					}
					case "error":
						console.warn("[reader]", message.message);
						return;
				}
			},
		}),
	);

	useMountEffect(() => {
		const unsubscribe = player.subscribe(pushAudioState);
		return () => {
			unsubscribe();
		};
	});

	// Backgrounding the app reads to the reader like a hidden tab: it pauses the
	// session clock and saves.
	useMountEffect(() => {
		const subscription = AppState.addEventListener("change", (state) =>
			deliver({
				type: "visibility",
				state: state === "active" ? "visible" : "hidden",
			}),
		);
		return () => subscription.remove();
	});

	return (
		<View
			style={{ flex: 1, backgroundColor: ground }}
			// Rotation and split screen change the insets; the page pads by them.
			onLayout={() => deliver({ type: "insets", insets: toInsets() })}
		>
			{/* Only the reader on screen owns the bars; a page waiting in the
			    background must not touch them. Reading goes full screen, as in
			    Play Books; the menu brings the bars back. */}
			{visible && shown ? (
				<>
					<StatusBar
						style={lightStatusBar ? "light" : "dark"}
						hidden={hideBars}
						animated
					/>
					<NavigationBar hidden={hideBars} />
				</>
			) : null}
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
				scrollEnabled={!onContentHeight}
				bounces={false}
				webviewDebuggingEnabled={__DEV__}
				style={{ flex: 1, backgroundColor: ground }}
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
