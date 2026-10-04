import type { ORPCErrorJSON } from "@orpc/client";

/** Bumped when either side changes a message shape; the host refuses a mismatch. */
export const READER_BRIDGE_PROTOCOL = 1;

/** Set by the host before the page's scripts run. */
export const READER_BOOT_GLOBAL = "__NANAHOSHI_READER_BOOT__";
/** Installed by the reader page; the host injects `<global>.receive(message)`. */
export const READER_RECEIVER_GLOBAL = "__nanahoshiReader";

export interface ReaderBootBook {
	title?: string | null;
	filename?: string | null;
	cover?: string | null;
	filesizeKb?: number | null;
	filehash?: string | null;
	pageCount?: number | null;
	languageCode?: string | null;
	contentForm?: "text" | "images" | null;
}

export interface ReaderInsets {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/** What the page shows: a book in the reader, the reading statistics, or
 * one title's history. */
export type ReaderBootScreen =
	| {
			kind: "reader";
			uuid: string;
			book: ReaderBootBook;
			/** Open straight into Read & Listen with this pairing. */
			readListenPairUuid?: string;
	  }
	| {
			kind: "stats";
			view: "all" | "reading" | "listening";
			/** The app's page colour, so the page doesn't sit a shade off it. */
			background?: string;
	  }
	| {
			/** One title's reading or listening history, with its goal. */
			kind: "history";
			bookUuid: string;
			medium: "reading" | "listening";
			amountChars?: number | null;
			durationSeconds?: number | null;
			chapters?: { title: string | null; startTime: number }[];
			background?: string;
	  };

export interface ReaderBootConfig {
	protocol: typeof READER_BRIDGE_PROTOCOL;
	screen: ReaderBootScreen;
	userId: string;
	serverId: string;
	/** Origin of the Nanahoshi server, for cover and media URLs. */
	serverUrl: string;
	locale: string;
	colorScheme: "light" | "dark";
	insets: ReaderInsets;
}

/** The app's audio player as Read & Listen sees it. */
export interface ReaderAudioState {
	audiobookUuid: string | null;
	isPlaying: boolean;
	playbackRate: number;
	/** Seconds across the whole audiobook. */
	globalCurrentTime: number;
}

export type ReaderAudioCommand =
	| { command: "load"; audiobookUuid: string }
	| { command: "play" | "pause" | "release" | "stop" }
	| { command: "seek"; seconds: number };

/** What the app's player bar shows while Read & Listen runs. */
export interface ReadListenBarState {
	pairUuid: string;
	statusText: string;
	followText: boolean;
	seekFromText: boolean;
}

/** Serialized oRPC payload (StandardRPCSerializer output). */
export type RpcPayload = object;

export type ReaderToHostMessage =
	| { type: "ready" }
	| { type: "rpc"; id: number; path: string[]; payload: RpcPayload }
	/** A web route the reader wanted to open (exit, book detail, stats). */
	| { type: "navigate"; href: string }
	/** Start an audiobook in the app's own player. */
	| { type: "play-audiobook"; uuid: string }
	/** Reader background, for the status and navigation bars; null = app default. */
	| { type: "chrome-color"; color: string | null }
	/** Reading without the menu: hide the status and navigation bars. */
	| { type: "immersive"; immersive: boolean }
	| { type: "invalidate"; target: "reading-progress" | "recommendations" }
	| ({ type: "audio" } & ReaderAudioCommand)
	/** Read & Listen started (or changed) in the reader; null when it ended. */
	| { type: "read-listen-bar"; bar: ReadListenBarState | null }
	| { type: "error"; message: string };

export type HostToReaderMessage =
	| { type: "rpc-result"; id: number; ok: true; payload: RpcPayload }
	| {
			type: "rpc-result";
			id: number;
			ok: false;
			error: ORPCErrorJSON<string, unknown>;
	  }
	| { type: "insets"; insets: ReaderInsets }
	| { type: "visibility"; state: "visible" | "hidden" }
	| { type: "audio-state"; state: ReaderAudioState }
	/** A Read & Listen control pressed in the app's player bar. */
	| {
			type: "read-listen-command";
			command: "toggle-follow" | "toggle-seek" | "exit";
	  };

/** JS the host injects to deliver one message to the page. */
export function hostDeliveryScript(message: HostToReaderMessage): string {
	return `window.${READER_RECEIVER_GLOBAL}&&window.${READER_RECEIVER_GLOBAL}.receive(${JSON.stringify(message)});true;`;
}

/** JS the host injects before content loads so the page boots without a round trip. */
export function hostBootScript(config: ReaderBootConfig): string {
	return `window.${READER_BOOT_GLOBAL}=${JSON.stringify(config)};true;`;
}
