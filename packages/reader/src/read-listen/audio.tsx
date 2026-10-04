import type { ComponentType } from "react";
import { type ReaderApi, readerHost } from "../host/reader-host";
import type { ReaderTheme } from "../presentation/settings";

export type ReadListenAudiobook = Awaited<
	ReturnType<ReaderApi["audiobooks"]["getDetails"]>
>;

export interface ReadListenAudioState {
	/** The audiobook loaded in the app's player, if any. */
	audiobookUuid: string | null;
	isPlaying: boolean;
	playbackRate: number;
	/** Playhead in seconds across the whole audiobook (every file). */
	globalCurrentTime: number;
}

export interface ReadListenAudioActions {
	/** Load the paired audiobook, paused, at its saved listening position. */
	load(audiobook: ReadListenAudiobook): void;
	/** Read & Listen left the reader; the player returns to its normal form. */
	release(): void;
	play(): void;
	pause(): void;
	seekTo(seconds: number): void;
	/** The exact playhead now, between state updates. */
	getGlobalCurrentTime(): number;
}

/** What the app's player shows while it narrates the book being read. */
export interface ReadListenControls {
	pairUuid: string;
	readerTheme?: ReaderTheme;
	statusText: string;
	onExitReadListen: () => void;
	followText: boolean;
	onToggleFollowText: () => void;
	seekFromText: boolean;
	onToggleSeekFromText: () => void;
}

/**
 * The app's audio player, as Read & Listen drives it: the web's HTML audio
 * player, or the phone's native one across the WebView bridge.
 */
export interface ReadListenAudio {
	useState(): ReadListenAudioState;
	useActions(): ReadListenAudioActions;
	/** Rendered while Read & Listen runs; puts its controls in the player. */
	Controls: ComponentType<{ context: ReadListenControls }>;
}

function audio(): ReadListenAudio {
	const port = readerHost().readListenAudio;
	if (!port) throw new Error("Read & Listen needs the app's audio player");
	return port;
}

export const useReadListenAudioState = () => audio().useState();
export const useReadListenAudioActions = () => audio().useActions();
export const ReadListenPlayerControls = (props: {
	context: ReadListenControls;
}) => {
	const { Controls } = audio();
	return <Controls {...props} />;
};
