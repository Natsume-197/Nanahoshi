import { COVER_QUALITY } from "@nanahoshi/api/lib/cover-ladder";
import {
	bindReaderHost,
	type ReaderApi,
} from "@nanahoshi/reader/host/reader-host";
import {
	createReaderPageBridge,
	READER_RECEIVER_GLOBAL,
	type ReaderBootConfig,
	type ReaderBootScreen,
	ReaderBridgeLink,
	type ReaderInsets,
	type ReaderToHostMessage,
} from "@nanahoshi/reader-bridge";
import { createORPCClient } from "@orpc/client";
import { toast } from "sonner";
import { createNativeAudio } from "./native-audio";

declare global {
	interface Window {
		ReactNativeWebView?: { postMessage(message: string): void };
	}
}

function applyInsets(insets: ReaderInsets) {
	const root = document.documentElement.style;
	root.setProperty("--safe-area-top", `${insets.top}px`);
	root.setProperty("--safe-area-right", `${insets.right}px`);
	root.setProperty("--safe-area-bottom", `${insets.bottom}px`);
	root.setProperty("--safe-area-left", `${insets.left}px`);
}

/**
 * The app going to the background reads to the page like a hidden tab: the
 * reader pauses its session clock and saves, exactly as on the web.
 */
function followHostVisibility(
	subscribe: (listener: (state: "visible" | "hidden") => void) => void,
) {
	let hostHidden = false;
	let native: (() => DocumentVisibilityState) | undefined;
	for (
		let proto = Object.getPrototypeOf(document);
		proto && !native;
		proto = Object.getPrototypeOf(proto)
	)
		native = Object.getOwnPropertyDescriptor(proto, "visibilityState")?.get;
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => (hostHidden ? "hidden" : (native?.call(document) ?? "visible")),
	});
	Object.defineProperty(document, "hidden", {
		configurable: true,
		get: () => document.visibilityState === "hidden",
	});
	subscribe((state) => {
		const before = document.visibilityState;
		hostHidden = state === "hidden";
		if (document.visibilityState !== before)
			document.dispatchEvent(
				new (document.defaultView?.Event ?? Event)("visibilitychange"),
			);
	});
}

let probe: CanvasRenderingContext2D | null | undefined;
/** Any CSS colour as rgb(), the form the app can paint (themes use oklch()). */
export function toRgb(color: string): string {
	probe ??= document.createElement("canvas").getContext("2d", {
		willReadFrequently: true,
	});
	if (!probe) return color;
	probe.clearRect(0, 0, 1, 1);
	probe.fillStyle = color;
	probe.fillRect(0, 0, 1, 1);
	const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
	return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Wires the reader to the native app: every oRPC call, navigation and chrome
 * tint crosses the WebView bridge, and the native side answers.
 */
export function connectNativeHost(boot: ReaderBootConfig) {
	const bridge = createReaderPageBridge((raw) =>
		window.ReactNativeWebView?.postMessage(raw),
	);
	Object.assign(window, { [READER_RECEIVER_GLOBAL]: bridge });
	const send = (message: ReaderToHostMessage) => bridge.send(message);
	// A page booted ahead of time learns its screen from "open".
	let screen = boot.screen;

	if (boot.background) {
		document.documentElement.style.backgroundColor = boot.background;
		document.body.style.backgroundColor = boot.background;
	}
	applyInsets(boot.insets);
	bridge.onInsets(applyInsets);
	followHostVisibility(bridge.onVisibility);
	document.documentElement.classList.toggle(
		"dark",
		boot.colorScheme === "dark",
	);

	bindReaderHost({
		api: createORPCClient(new ReaderBridgeLink(bridge)) as ReaderApi,
		locale: () => boot.locale,
		coverUrl: (filename, width) =>
			`${boot.serverUrl}/api/data/covers/${filename}?width=${width}&quality=${COVER_QUALITY}`,
		setChromeColor: (color) =>
			send({ type: "chrome-color", color: color && toRgb(color) }),
		setImmersive: (immersive) => send({ type: "immersive", immersive }),
		notifyError: (message) => toast.error(message),
		openAppRoute: (href) => send({ type: "navigate", href }),
		usePlayAudiobook: () => (uuid) => send({ type: "play-audiobook", uuid }),
		readListenAudio: createNativeAudio(bridge, send),
		// The native app already keeps the book file on disk.
		cacheBookFiles: false,
		onProgressSaved: () =>
			send({ type: "invalidate", target: "reading-progress" }),
		onReadingSessionEnded: () =>
			send({ type: "invalidate", target: "recommendations" }),
	});

	return {
		exitToBook: () => {
			if (screen?.kind === "reader")
				send({
					type: "navigate",
					href: `/dashboard/books/${screen.uuid}`,
				});
		},
		/** A screen sent to a page booted ahead of time. */
		onOpen: (show: (screen: ReaderBootScreen, serverId: string) => void) =>
			bridge.onOpen((message) => {
				screen = message.screen;
				show(message.screen, message.serverId);
			}),
		ready: () => send({ type: "ready" }),
		/** The system Back closes a reader panel before it leaves the book. */
		onBack: (dismiss: () => boolean) =>
			bridge.onBack(() => send({ type: "back-result", handled: dismiss() })),
		/** Leaving the screen: `unmount` runs the reader's exit saves, then the host is told. */
		onClose: (unmount: () => void) =>
			bridge.onClose(async () => {
				unmount();
				await bridge.drained();
				send({ type: "closed" });
			}),
		stopAudio: () => send({ type: "audio", command: "stop" }),
		goBack: () => send({ type: "navigate", href: "back" }),
		reportError: (message: string) => send({ type: "error", message }),
		/** Ref callback: keeps the host told how tall the element is. */
		reportHeight: (element: HTMLElement | null) => {
			if (!element) return;
			let last = 0;
			const observer = new ResizeObserver(() => {
				const height = Math.ceil(element.getBoundingClientRect().height);
				if (height === last) return;
				last = height;
				send({ type: "content-height", height });
			});
			observer.observe(element);
			return () => observer.disconnect();
		},
	};
}
