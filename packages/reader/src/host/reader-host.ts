import type { AppRouter } from "@nanahoshi/api/routers/index";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import {
	baseLocale,
	isLocale,
	overwriteGetLocale,
} from "../i18n/paraglide/runtime";
import type { ReadListenAudio } from "../read-listen/audio";

export interface ReaderClientContext {
	/** Let the request outlive page hide/freeze (final progress syncs). */
	keepalive?: boolean;
}

export type ReaderApi = RouterClient<AppRouter, ReaderClientContext>;

/**
 * Everything the reader needs from the app hosting it. The web app binds its
 * authenticated oRPC client; the mobile WebView binds one that runs every call
 * through the native app.
 */
export interface ReaderHost {
	api: ReaderApi;
	/** The host's current UI language; unsupported ones fall back to English. */
	locale(): string;
	/** Absolute URL of one cover rendition. */
	coverUrl(filename: string, width: number): string;
	/** Tint the surrounding chrome (status bar, browser UI); null restores the app color. */
	setChromeColor(color: string | null): void;
	/** Hide the system bars while reading; false brings them back (menu open, exit). */
	setImmersive?(immersive: boolean): void;
	notifyError(message: string): void;
	/** False when the host already keeps book files on disk (mobile). */
	cacheBookFiles?: boolean;
	/** Open one of the app's own pages, e.g. "/dashboard/stats?view=reading". */
	openAppRoute(href: string): void;
	/** A React hook from the app: start an audiobook in the app's own player. */
	usePlayAudiobook(): (uuid: string) => Promise<void> | void;
	/** The app's audio player for Read & Listen; without it the mode is off. */
	readListenAudio?: ReadListenAudio;
	/** Product analytics, when the app collects it. */
	track?(event: string, properties?: Record<string, unknown>): void;
	/** Reading progress changed on the server; refresh anything showing it. */
	onProgressSaved(): void;
	/** A reading session ended; recommendations may have moved. */
	onReadingSessionEnded(): void;
}

let boundHost: ReaderHost | undefined;
let queryUtils: ReturnType<typeof createReaderQueryUtils> | undefined;

const createReaderQueryUtils = (api: ReaderApi) =>
	createTanstackQueryUtils(api);

/** Called once by the app entry before the reader renders. */
export function bindReaderHost(host: ReaderHost) {
	boundHost = host;
	queryUtils = undefined;
	overwriteGetLocale(() => {
		const locale = host.locale();
		return isLocale(locale) ? locale : baseLocale;
	});
}

export function readerHost(): ReaderHost {
	if (!boundHost) throw new Error("The reader host was not bound");
	return boundHost;
}

export function readerApi(): ReaderApi {
	return readerHost().api;
}

/** TanStack Query helpers over the host API; keys match the app's own. */
export function readerQueryUtils() {
	queryUtils ??= createReaderQueryUtils(readerApi());
	return queryUtils;
}
