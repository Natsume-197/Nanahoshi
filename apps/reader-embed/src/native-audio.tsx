import type {
	ReadListenAudio,
	ReadListenControls,
} from "@nanahoshi/reader/read-listen/audio";
import type {
	ReaderAudioState,
	ReaderPageBridge,
	ReaderToHostMessage,
	ReadListenBarState,
} from "@nanahoshi/reader-bridge";
import { useMountEffect } from "@nanahoshi/ui/hooks/use-mount-effect";
import { useOnUnmount } from "@nanahoshi/ui/hooks/use-on-unmount";
import { useSyncExternalStore } from "react";

// The native player reports twice a second; the highlight moves between
// reports by the clock, so a sentence change lands on time, not up to 500 ms late.
const INTERPOLATE_MS = 100;

/**
 * Read & Listen's audio on the phone: the app's native player, driven across
 * the bridge. Its state arrives as messages; commands go back the same way.
 */
export function createNativeAudio(
	bridge: ReaderPageBridge,
	send: (message: ReaderToHostMessage) => void,
): ReadListenAudio {
	let reported: ReaderAudioState = {
		audiobookUuid: null,
		isPlaying: false,
		playbackRate: 1,
		globalCurrentTime: 0,
	};
	let reportedAt = performance.now();
	let snapshot = reported;
	const listeners = new Set<() => void>();
	let ticker: number | undefined;

	const now = () =>
		reported.isPlaying
			? reported.globalCurrentTime +
				((performance.now() - reportedAt) / 1000) * reported.playbackRate
			: reported.globalCurrentTime;
	const publish = () => {
		snapshot = { ...reported, globalCurrentTime: now() };
		for (const listener of listeners) listener();
	};
	bridge.onAudioState((state) => {
		reported = state;
		reportedAt = performance.now();
		publish();
		if (state.isPlaying && ticker === undefined)
			ticker = window.setInterval(publish, INTERPOLATE_MS);
		if (!state.isPlaying && ticker !== undefined) {
			window.clearInterval(ticker);
			ticker = undefined;
		}
	});
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	const handlers: { current: ReadListenControls | null } = { current: null };
	bridge.onReadListenCommand((command) => {
		const controls = handlers.current;
		if (!controls) return;
		if (command === "toggle-follow") controls.onToggleFollowText();
		else if (command === "toggle-seek") controls.onToggleSeekFromText();
		else controls.onExitReadListen();
	});

	const actions = {
		load: (audiobook: { uuid: string }) =>
			send({ type: "audio", command: "load", audiobookUuid: audiobook.uuid }),
		release: () => send({ type: "audio", command: "release" }),
		play: () => send({ type: "audio", command: "play" }),
		pause: () => send({ type: "audio", command: "pause" }),
		seekTo: (seconds: number) => {
			// Move the local clock at once so the highlight doesn't flash back.
			reported = { ...reported, globalCurrentTime: seconds };
			reportedAt = performance.now();
			publish();
			send({ type: "audio", command: "seek", seconds });
		},
		getGlobalCurrentTime: now,
	};

	return {
		useState: () =>
			useSyncExternalStore(
				subscribe,
				() => snapshot,
				() => snapshot,
			),
		useActions: () => actions,
		Controls: function NativeReadListenControls({ context }) {
			handlers.current = context;
			useOnUnmount(() => {
				handlers.current = null;
				send({ type: "read-listen-bar", bar: null });
			});
			const bar = {
				pairUuid: context.pairUuid,
				statusText: context.statusText,
				followText: context.followText,
				seekFromText: context.seekFromText,
			};
			return <PublishBar key={JSON.stringify(bar)} bar={bar} send={send} />;
		},
	};
}

/** Sends the bar's state once per distinct value (keyed by it). */
function PublishBar({
	bar,
	send,
}: {
	bar: ReadListenBarState;
	send: (message: ReaderToHostMessage) => void;
}) {
	useMountEffect(() => {
		send({ type: "read-listen-bar", bar });
	});
	return null;
}
