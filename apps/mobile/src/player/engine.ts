import type { QueryClient } from "@tanstack/react-query";
import {
	type AudioPlayer,
	type AudioStatus,
	createAudioPlayer,
	setAudioModeAsync,
} from "expo-audio";
import type { File } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { AppState, type NativeEventSubscription } from "react-native";
import {
	findDownloadedAudiobook,
	localCoverUri,
	readLocalPosition,
	type SavedAudiobook,
	saveLocalPosition,
} from "@/downloads/files";
import { pickStartPosition } from "@/downloads/model";
import type { Api } from "@/lib/api";
import type { NanahoshiAuth } from "@/lib/auth-client";
import { coverUrl } from "@/lib/covers";
import { titleOrUntitled } from "@/lib/format";
import { parseServerTime } from "@/lib/server-time";
import { decodeActiveBook, encodeActiveBook } from "./active-book";
import {
	type BookPreview,
	guessStart,
	type PendingBook,
	pendingBook,
} from "./pending";
import { resolveBookSpeed } from "./speed";
import {
	activeChapterIndex,
	type Chapter,
	clampSpeed,
	DEFAULT_JUMP_BACK,
	DEFAULT_JUMP_FORWARD,
	extendSleep,
	findNextInSeries,
	type JumpAmount,
	normalizeJumpAmount,
	type SleepMode,
	sleepFadeFactor,
	smartRewind,
} from "./timing";

export type PlayerBook = {
	uuid: string;
	title: string;
	cover: string | null;
	color: string | null;
	authors: string[];
	narrators: string[];
	chapters: Chapter[];
	files: { index: number; duration: number }[];
	duration: number;
	seriesUuid: string | null;
};

type AudiobookDetails = Awaited<
	ReturnType<Api["client"]["audiobooks"]["getDetails"]>
>;

/** The web's audiobook details, as the player keeps them. */
export function playerBookFrom(
	uuid: string,
	details: AudiobookDetails,
): PlayerBook {
	const files = (details.audioFiles ?? []).map((file) => ({
		index: file.index,
		duration: file.duration ?? 0,
	}));
	const duration =
		details.duration || files.reduce((sum, file) => sum + file.duration, 0);
	return {
		uuid,
		title: titleOrUntitled(details.title),
		cover: details.cover ?? null,
		color: details.mainColor ?? null,
		authors: (details.authors ?? []).map((author) => author.name),
		narrators: (details.narrators ?? []).map((narrator) => narrator.name),
		chapters: (details.chapters ?? []).map((chapter) => ({
			index: chapter.index,
			title: chapter.title ?? null,
			startTime: chapter.startTime,
			endTime: chapter.endTime,
		})),
		files: files.length > 0 ? files : [{ index: 0, duration }],
		duration,
		seriesUuid: details.series?.uuid ?? null,
	};
}

function stripTracks({ tracks: _, ...book }: SavedAudiobook): PlayerBook {
	return book;
}

const PROGRESS_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, ms: number | null): Promise<T> {
	if (ms === null) return promise;
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error("timeout")), ms),
		),
	]);
}

export type SleepState = { mode: SleepMode; remaining: number };

export type PlayerSnapshot = {
	book: PlayerBook | null;
	/** Book being fetched before it can play (drives the button spinner). */
	loadingUuid: string | null;
	/** The tapped book while it loads, or after it failed to: the mini player
	 * shows it so a tap never looks like nothing happened. */
	pending: PendingBook | null;
	playing: boolean;
	buffering: boolean;
	/** Position in the whole book, across files. */
	time: number;
	rate: number;
	/** The last speed picked anywhere: what a book without its own plays at. */
	defaultRate: number;
	/** This book plays at its own speed, not the default. */
	rateOverride: boolean;
	sleep: SleepState | null;
	error: boolean;
	ended: boolean;
	/** The finished-book card: shown when the book ends with nothing to
	 * autoplay, until dismissed or playback moves on. */
	endCard: boolean;
	jumpBack: JumpAmount;
	jumpForward: JumpAmount;
	autoplayNext: boolean;
	/** Next book of the series, resolved near the end of this one. */
	upNext: { uuid: string; title: string | null } | null;
};

const SPEED_KEY = "nanahoshi.audio-speed";
const JUMP_BACK_KEY = "nanahoshi.audio-jump-back";
const JUMP_FORWARD_KEY = "nanahoshi.audio-jump-forward";
const AUTOPLAY_NEXT_KEY = "nanahoshi.audio-autoplay-next";
const ACTIVE_BOOK_KEY = "nanahoshi.audio-active-book";
/** Up Next is looked up once this close to the end of the book. */
const UP_NEXT_LEAD_SECONDS = 300;
const SYNC_INTERVAL_MS = 45_000;
const COMPLETION_THRESHOLD = 0.95;

type Deps = {
	serverUrl: string;
	auth: NanahoshiAuth;
	api: Api;
	queryClient: QueryClient;
};

function readStored(key: string): string | null {
	try {
		return SecureStore.getItem(key);
	} catch {
		return null;
	}
}

function writeStored(key: string, value: string) {
	try {
		SecureStore.setItem(key, value);
	} catch {
		// Preference only.
	}
}

const bookSpeedKey = (uuid: string) => `${SPEED_KEY}.${uuid}`;

function readBookSpeed(uuid: string): number | null {
	const raw = readStored(bookSpeedKey(uuid));
	return raw ? Number(raw) : null;
}

function readSpeed(): number {
	try {
		const raw = SecureStore.getItem(SPEED_KEY);
		return raw ? clampSpeed(Number(raw)) : 1;
	} catch {
		return 1;
	}
}

/**
 * The phone's version of the web's AudioPlayerProvider: one native player for
 * the app's lifetime, fed file by file (multi-file audiobooks), with a
 * book-wide clock, chapter skips, speed, a sleep timer, smart rewind, lock
 * screen controls and listening progress synced to the server. A tiny
 * external store (subscribe/getSnapshot) so only the views that read a field
 * re-render on playback ticks.
 */
export class PlayerEngine {
	private snapshot: PlayerSnapshot = {
		book: null,
		loadingUuid: null,
		pending: null,
		playing: false,
		buffering: false,
		time: 0,
		rate: readSpeed(),
		defaultRate: readSpeed(),
		rateOverride: false,
		sleep: null,
		error: false,
		ended: false,
		endCard: false,
		jumpBack: normalizeJumpAmount(readStored(JUMP_BACK_KEY), DEFAULT_JUMP_BACK),
		jumpForward: normalizeJumpAmount(
			readStored(JUMP_FORWARD_KEY),
			DEFAULT_JUMP_FORWARD,
		),
		// On by default: series listeners expect the next book to follow.
		autoplayNext: readStored(AUTOPLAY_NEXT_KEY) !== "0",
		upNext: null,
	};
	private readonly listeners = new Set<() => void>();
	private readonly player: AudioPlayer;
	private offsets: number[] = [];
	/** The book's files on disk, in play order, when it was downloaded. */
	private localFiles: File[] | null = null;
	private fileIndex = -1;
	private pendingSeek: number | null = null;
	private resumeAfterLoad = false;
	private lastSyncAt: number | null = null;
	private pausedAt: number | null = null;
	/** When the loaded book was last heard, for smart rewind after a restore. */
	private lastHeardAt: number | null = null;
	/** Position the server last got; a paused book there has nothing new. */
	private savedTime: number | null = null;
	private lastTick = Date.now();
	private completed = false;
	private sessionReady = false;
	private disposers: (() => void)[] = [];
	private upNextFor: string | null = null;

	constructor(private readonly deps: Deps) {
		this.player = createAudioPlayer(null, {
			updateInterval: 500,
			keepAudioSessionActive: true,
		});
	}

	// ── store ──────────────────────────────────────────────────────────────
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	getSnapshot = () => this.snapshot;
	private set(patch: Partial<PlayerSnapshot>) {
		this.snapshot = { ...this.snapshot, ...patch };
		for (const listener of this.listeners) listener();
	}

	/** Wire native events; returns the teardown. Called once on mount. */
	attach() {
		const status = this.player.addListener("playbackStatusUpdate", (s) =>
			this.onStatus(s),
		);
		const appState: NativeEventSubscription = AppState.addEventListener(
			"change",
			(state) => {
				if (state !== "active") void this.sync();
			},
		);
		const tick = setInterval(() => this.onTick(), 1000);
		this.disposers = [
			() => status.remove(),
			() => appState.remove(),
			() => clearInterval(tick),
		];
		void this.restore();
		return () => {
			void this.sync();
			for (const dispose of this.disposers) dispose();
			this.player.clearLockScreenControls();
			this.player.remove();
		};
	}

	// ── loading ────────────────────────────────────────────────────────────
	/**
	 * Reopening the app brings back the book that was loaded, paused at its
	 * saved position, as the web does after a reload. The pause counts from
	 * the last listen, so smart rewind applies on the first play.
	 */
	private async restore() {
		const uuid = decodeActiveBook(
			readStored(ACTIVE_BOOK_KEY),
			this.deps.serverUrl,
		);
		if (!uuid || this.snapshot.book || this.snapshot.loadingUuid) return;
		await this.play(uuid, { autoplay: false, quiet: true });
		const after = this.getSnapshot();
		if (!after.book) {
			// Kept: offline looks the same as a deleted book, and the next
			// launch retries silently.
			this.set({ error: false });
			return;
		}
		if (after.book.uuid === uuid && !after.playing) {
			this.pausedAt = this.lastHeardAt;
		}
	}

	/**
	 * Start (or resume) an audiobook from where the server says we left it.
	 * Read & Listen loads it paused (autoplay false) and starts it itself.
	 */
	async play(
		uuid: string,
		{
			autoplay = true,
			preview,
			quiet = false,
		}: {
			autoplay?: boolean;
			/** What the tapped card already shows, for the mini player while
			 * the book loads. */
			preview?: BookPreview;
			/** A restore at launch: no card while loading, none if it fails. */
			quiet?: boolean;
		} = {},
	) {
		if (this.snapshot.book?.uuid === uuid) {
			if (autoplay && !this.snapshot.playing) this.resume();
			return;
		}
		const { orpc, client } = this.deps.api;
		const detailsQuery = orpc.audiobooks.getDetails.queryOptions({
			input: { uuid },
		});
		// A downloaded book plays from disk right away; the server is only
		// asked for the position, and not for long.
		const local = findDownloadedAudiobook(uuid);
		const cached = this.deps.queryClient.getQueryData(detailsQuery.queryKey);
		this.set({
			loadingUuid: uuid,
			error: false,
			pending: quiet
				? null
				: pendingBook(
						uuid,
						[
							local ? stripTracks(local.book) : null,
							cached ? playerBookFrom(uuid, cached) : null,
							preview,
						],
						this.knownStart(uuid, !!local),
					),
		});
		try {
			const [details, progress] = await Promise.all([
				local
					? null
					: this.deps.queryClient.ensureQueryData({
							...detailsQuery,
							// The card is already saying "loading": fail in seconds, not
							// after the default three retries, and fail offline instead of
							// pausing until the network comes back.
							retry: 1,
							networkMode: "always",
						}),
				withTimeout(
					client.listeningProgress.getProgress({ bookUuid: uuid }),
					local ? PROGRESS_TIMEOUT_MS : null,
				).catch(() => null),
			]);
			if (this.snapshot.loadingUuid !== uuid) return; // superseded by another tap
			await this.ensureSession();
			await this.sync(); // persist the book we're leaving
			const book = local
				? stripTracks(local.book)
				: details
					? playerBookFrom(uuid, details)
					: null;
			if (!book) throw new Error("Audiobook details missing");
			const duration = book.duration;
			this.localFiles = local?.files ?? null;
			let acc = 0;
			this.offsets = book.files.map((file) => {
				const start = acc;
				acc += file.duration;
				return start;
			});
			const serverRate = progress?.playbackRate;
			const defaultRate = readSpeed();
			const { rate, override: rateOverride } = resolveBookSpeed({
				server: serverRate,
				local: readBookSpeed(uuid),
				fallback: defaultRate,
			});
			// Remembered here too, so it holds when the server can't be asked.
			if (serverRate != null) writeStored(bookSpeedKey(uuid), String(rate));
			// A finished book starts over rather than sitting on its last second.
			const serverSaved = progress
				? {
						time: progress.currentTimeSeconds ?? 0,
						updatedAt: parseServerTime(progress.lastListenedAt),
					}
				: null;
			const localSaved = local ? readLocalPosition(uuid) : null;
			const saved = pickStartPosition(serverSaved, localSaved);
			const heard = [serverSaved?.updatedAt, localSaved?.updatedAt].filter(
				(at): at is number => typeof at === "number" && Number.isFinite(at),
			);
			this.lastHeardAt = heard.length > 0 ? Math.max(...heard) : null;
			const finished = !saved.fromLocal && progress?.status === "completed";
			const start = finished || saved.time >= duration - 5 ? 0 : saved.time;
			this.completed = false;
			this.upNextFor = null;
			this.pausedAt = null;
			this.savedTime = start;
			writeStored(ACTIVE_BOOK_KEY, encodeActiveBook(this.deps.serverUrl, uuid));
			this.player.volume = 1;
			// loadingUuid holds until the first file is in and playing, so the
			// button goes spinner → pause without a play frame between.
			this.set({
				book,
				pending: null,
				time: start,
				rate,
				defaultRate,
				rateOverride,
				ended: false,
				endCard: false,
				upNext: null,
				sleep: null,
			});
			this.player.setActiveForLockScreen(true, this.lockScreenMetadata(book), {
				showSeekBackward: true,
				showSeekForward: true,
			});
			this.fileIndex = -1; // force the first file to load for this book
			await this.seek(start, autoplay);
			if (this.snapshot.loadingUuid === uuid) this.set({ loadingUuid: null });
			this.player.setPlaybackRate(rate);
			this.lastSyncAt = Date.now();
		} catch {
			if (this.snapshot.loadingUuid !== uuid) {
				// Loaded, then failed to start: the card's own error line says so.
				if (this.snapshot.book?.uuid === uuid) this.set({ error: true });
				// Otherwise dismissed or superseded meanwhile: nothing to report.
				return;
			}
			const pending = this.snapshot.pending;
			this.set({
				loadingUuid: null,
				pending: pending?.uuid === uuid ? { ...pending, failed: true } : null,
				error: !pending,
			});
		}
	}

	/** Where the book will most likely start, from what the phone already
	 * has (no request): its download's position, then any cached progress. */
	private knownStart(uuid: string, downloaded: boolean): number | null {
		const { orpc } = this.deps.api;
		const queryClient = this.deps.queryClient;
		const progress = queryClient.getQueryData(
			orpc.listeningProgress.getProgress.queryKey({
				input: { bookUuid: uuid },
			}),
		);
		const listed = queryClient
			.getQueriesData({ queryKey: orpc.listeningProgress.listInProgress.key() })
			.flatMap(([, data]) => (Array.isArray(data) ? data : []))
			.find((entry) => entry.bookUuid === uuid);
		const server = progress ?? listed;
		return guessStart(
			downloaded ? readLocalPosition(uuid)?.time : null,
			server
				? {
						time: server.currentTimeSeconds,
						completed: server.status === "completed",
					}
				: null,
		);
	}

	/** Try the book that failed to load again. */
	retryPending = () => {
		const pending = this.snapshot.pending;
		if (!pending) return;
		const { uuid, failed: _, ...preview } = pending;
		void this.play(uuid, { preview });
	};

	/** Put away the card of a book that is loading or failed; whatever was
	 * playing before shows again. */
	dismissPending = () => {
		this.set({ pending: null, loadingUuid: null });
	};

	private async ensureSession() {
		if (this.sessionReady) return;
		this.sessionReady = true;
		await setAudioModeAsync({
			playsInSilentMode: true,
			shouldPlayInBackground: true,
			interruptionMode: "doNotMix",
		}).catch(() => undefined);
	}

	private lockScreenMetadata(book: PlayerBook) {
		return {
			title: book.title,
			// Many audiobooks only credit narrators; never leave the line blank.
			artist: book.authors.join(", ") || book.narrators.join(", "),
			// Only beside an author: as the fallback artist they'd show twice.
			albumTitle:
				book.authors.length > 0
					? book.narrators.join(", ") || undefined
					: undefined,
			artworkUrl:
				(this.localFiles ? localCoverUri(book.uuid) : null) ??
				coverUrl(this.deps.serverUrl, book.cover, 512) ??
				undefined,
		};
	}

	private async source(fileIndex: number) {
		const local = this.localFiles?.[fileIndex];
		if (local?.exists) return { uri: local.uri };
		const book = this.snapshot.book;
		const cookie = await this.deps.auth.getCookie();
		return {
			uri: `${this.deps.serverUrl}/stream/${book?.uuid}/${book?.files[fileIndex]?.index ?? fileIndex}`,
			headers: cookie ? { Cookie: cookie } : undefined,
		};
	}

	private async loadFile(fileIndex: number, within: number, autoplay: boolean) {
		this.fileIndex = fileIndex;
		this.pendingSeek = within > 0.5 ? within : null;
		this.resumeAfterLoad = autoplay;
		this.player.replace(await this.source(fileIndex));
		this.player.setPlaybackRate(this.snapshot.rate);
		if (this.pendingSeek === null && autoplay) this.player.play();
	}

	// ── transport ──────────────────────────────────────────────────────────
	toggle = () => (this.snapshot.playing ? this.pause() : this.resume());

	resume = () => {
		if (!this.snapshot.book) return;
		if (this.snapshot.ended) {
			this.replay();
			return;
		}
		const rewind = this.pausedAt
			? smartRewind(Date.now() - this.pausedAt, this.snapshot.time)
			: 0;
		this.pausedAt = null;
		this.lastSyncAt = Date.now();
		if (rewind > 0) void this.seek(this.snapshot.time - rewind, true);
		else this.player.play();
		this.set({ playing: true, error: false });
	};

	pause = () => {
		this.player.pause();
		this.pausedAt = Date.now();
		this.set({ playing: false });
		void this.sync();
		this.lastSyncAt = null;
	};

	/** Jump anywhere in the book; crosses file boundaries as needed. */
	seek = async (global: number, autoplay = this.snapshot.playing) => {
		const book = this.snapshot.book;
		if (!book) return;
		const target = Math.max(
			0,
			Math.min(global, Math.max(0, book.duration - 1)),
		);
		let index = this.offsets.length - 1;
		while (index > 0 && this.offsets[index] > target) index--;
		index = Math.max(0, index);
		const within = target - (this.offsets[index] ?? 0);
		this.set({ time: target, ended: false, endCard: false });
		if (index !== this.fileIndex || !this.player.isLoaded) {
			await this.loadFile(index, within, autoplay);
		} else {
			await this.player.seekTo(within).catch(() => undefined);
			if (autoplay && !this.player.playing) this.player.play();
		}
		if (autoplay) this.set({ playing: true });
	};

	skip = (seconds: number) => void this.seek(this.snapshot.time + seconds);
	back = () => this.skip(-this.snapshot.jumpBack);
	forward = () => this.skip(this.snapshot.jumpForward);

	setJumpBack = (seconds: JumpAmount) => {
		this.set({ jumpBack: seconds });
		writeStored(JUMP_BACK_KEY, String(seconds));
	};

	setJumpForward = (seconds: JumpAmount) => {
		this.set({ jumpForward: seconds });
		writeStored(JUMP_FORWARD_KEY, String(seconds));
	};

	setAutoplayNext = (enabled: boolean) => {
		this.set({ autoplayNext: enabled });
		writeStored(AUTOPLAY_NEXT_KEY, enabled ? "1" : "0");
	};

	/** From the top of the book, playing. */
	replay = () => {
		this.set({ ended: false, endCard: false });
		void this.seek(0, true);
	};

	dismissEndCard = () => this.set({ endCard: false });

	/** Start the next book of the series from its beginning. */
	playNextInSeries = async (): Promise<boolean> => {
		const next = this.snapshot.upNext ?? (await this.resolveUpNext());
		if (!next) return false;
		await this.play(next.uuid);
		return this.snapshot.book?.uuid === next.uuid;
	};

	private async resolveUpNext() {
		const book = this.snapshot.book;
		if (!book?.seriesUuid) return null;
		if (this.upNextFor === book.uuid) return this.snapshot.upNext;
		this.upNextFor = book.uuid;
		try {
			// The listing comes back in reading order; never re-sort it.
			const list = await this.deps.api.client.audiobooks.listBySeries({
				seriesUuid: book.seriesUuid,
			});
			if (this.snapshot.book?.uuid !== book.uuid) return null;
			const found = findNextInSeries(book.uuid, list);
			const upNext = found
				? { uuid: found.uuid, title: found.title ?? null }
				: null;
			this.set({ upNext });
			return upNext;
		} catch {
			// A hint only; let a later tick try again.
			this.upNextFor = null;
			return null;
		}
	}

	prevChapter = () => {
		const chapters = this.snapshot.book?.chapters ?? [];
		const index = activeChapterIndex(chapters, this.snapshot.time);
		if (index < 0) return void this.seek(0);
		// Past the first few seconds, "previous" restarts the current chapter.
		const restart = this.snapshot.time - chapters[index].startTime > 3;
		void this.seek(
			chapters[restart ? index : Math.max(0, index - 1)].startTime,
		);
	};

	nextChapter = () => {
		const chapters = this.snapshot.book?.chapters ?? [];
		const next = chapters[activeChapterIndex(chapters, this.snapshot.time) + 1];
		if (next) void this.seek(next.startTime);
	};

	/** A speed picked by hand: the book's and the new default, like the web. */
	setRate = (value: number) => {
		const rate = clampSpeed(value);
		this.player.setPlaybackRate(rate);
		this.set({ rate, defaultRate: rate, rateOverride: false });
		writeStored(SPEED_KEY, String(rate));
		const uuid = this.snapshot.book?.uuid;
		if (!uuid) return;
		writeStored(bookSpeedKey(uuid), String(rate));
		this.saveRate(uuid, rate);
	};

	/** Drops this book's own speed for the default. */
	resetRateToDefault = () => {
		const rate = readSpeed();
		this.player.setPlaybackRate(rate);
		this.set({ rate, defaultRate: rate, rateOverride: false });
		const uuid = this.snapshot.book?.uuid;
		if (!uuid) return;
		writeStored(bookSpeedKey(uuid), "");
		// Other devices drop the override too.
		this.saveRate(uuid, rate);
	};

	private saveRate(uuid: string, rate: number) {
		void this.deps.api.client.listeningProgress
			.saveProgress({ bookUuid: uuid, playbackRate: rate })
			.catch(() => undefined);
	}

	setSleep = (mode: SleepMode | null) => {
		this.player.volume = 1;
		this.set({
			sleep: mode ? { mode, remaining: this.sleepRemaining(mode) } : null,
		});
	};

	/** Five more minutes, as a plain countdown. */
	extendSleep = () => {
		const sleep = this.snapshot.sleep;
		if (!sleep) return;
		this.player.volume = 1;
		this.set({ sleep: extendSleep(sleep.remaining) });
	};

	/** Close the player: save the position, drop the lock screen card. */
	stop = async () => {
		this.player.pause();
		writeStored(ACTIVE_BOOK_KEY, "");
		this.pausedAt = null;
		await this.sync();
		this.player.clearLockScreenControls();
		// Never replace(null): Android's native replace rejects null and the
		// unhandled rejection crashes the app. fileIndex -1 forces a reload.
		this.fileIndex = -1;
		this.offsets = [];
		this.localFiles = null;
		this.set({
			book: null,
			playing: false,
			buffering: false,
			time: 0,
			sleep: null,
			ended: false,
			endCard: false,
			upNext: null,
			error: false,
			pending: null,
		});
	};

	// ── native events ──────────────────────────────────────────────────────
	private onStatus(status: AudioStatus) {
		const book = this.snapshot.book;
		if (!book) return;
		if (this.pendingSeek !== null && status.isLoaded) {
			const within = this.pendingSeek;
			this.pendingSeek = null;
			void this.player.seekTo(within).then(() => {
				if (this.resumeAfterLoad) this.player.play();
			});
			return;
		}
		if (status.didJustFinish) {
			this.onFileEnd();
			return;
		}
		if (!status.isLoaded) return;
		// Paused or resumed outside the app's buttons (lock screen, headset,
		// a call): smart rewind still applies, like the web's play event.
		if (!status.playing && this.snapshot.playing && this.pausedAt === null) {
			this.pausedAt = Date.now();
		} else if (status.playing && !this.snapshot.playing) {
			const rewind = this.pausedAt
				? smartRewind(Date.now() - this.pausedAt, this.snapshot.time)
				: 0;
			this.pausedAt = null;
			if (rewind > 0) {
				void this.seek(this.snapshot.time - rewind, true);
				return;
			}
		}
		this.set({
			playing: status.playing,
			buffering: status.isBuffering && !status.playing,
			time: (this.offsets[this.fileIndex] ?? 0) + status.currentTime,
		});
	}

	private onFileEnd() {
		const book = this.snapshot.book;
		if (!book) return;
		const next = this.fileIndex + 1;
		if (next < book.files.length) {
			void this.loadFile(next, 0, true);
			return;
		}
		this.set({ playing: false, ended: true, time: book.duration, sleep: null });
		void this.sync("completed");
		void this.finishBook(book.uuid);
	}

	private async finishBook(uuid: string) {
		if (this.snapshot.autoplayNext && (await this.playNextInSeries())) return;
		if (this.snapshot.book?.uuid === uuid) this.set({ endCard: true });
	}

	/** Once a second: sleep timer countdown and the periodic progress save. */
	private onTick() {
		const now = Date.now();
		const elapsed = (now - this.lastTick) / 1000;
		this.lastTick = now;
		const { sleep, playing } = this.snapshot;
		if (sleep && playing) {
			const remaining =
				sleep.mode.kind === "duration"
					? sleep.remaining - elapsed
					: this.sleepRemaining(sleep.mode);
			if (remaining <= 0) {
				this.set({ sleep: null });
				this.pause();
				this.player.volume = 1;
			} else {
				this.player.volume = sleepFadeFactor(remaining);
				this.set({ sleep: { ...sleep, remaining } });
			}
		}
		const book = this.snapshot.book;
		if (
			playing &&
			book?.seriesUuid &&
			this.snapshot.autoplayNext &&
			book.duration - this.snapshot.time < UP_NEXT_LEAD_SECONDS
		)
			void this.resolveUpNext();
		if (
			playing &&
			this.lastSyncAt !== null &&
			now - this.lastSyncAt >= SYNC_INTERVAL_MS
		)
			void this.sync();
	}

	private sleepRemaining(mode: SleepMode): number {
		const book = this.snapshot.book;
		const time = this.snapshot.time;
		if (mode.kind === "duration") return mode.minutes * 60;
		if (!book) return 0;
		const rate = this.snapshot.rate || 1;
		if (mode.kind === "chapter") {
			const chapter = book.chapters[activeChapterIndex(book.chapters, time)];
			const end =
				chapter && time < chapter.endTime ? chapter.endTime : book.duration;
			return Math.max(0, end - time) / rate;
		}
		return Math.max(0, book.duration - time) / rate;
	}

	// ── progress ───────────────────────────────────────────────────────────
	private syncQueue: Promise<void> = Promise.resolve();

	/** Save the position (the web's usePlayerSync), serialized. */
	sync(status?: "completed") {
		const book = this.snapshot.book;
		if (!book) return this.syncQueue;
		const time = this.snapshot.time;
		// Backgrounding the app with a book paused would stamp it "listened
		// now" server side: wrong for Continue's order and smart rewind.
		if (!status && !this.snapshot.playing && time === this.savedTime)
			return this.syncQueue;
		this.savedTime = time;
		const now = Date.now();
		const listened =
			this.lastSyncAt === null ? 0 : Math.floor((now - this.lastSyncAt) / 1000);
		this.lastSyncAt = this.snapshot.playing ? now : null;
		const done =
			status === "completed" ||
			(book.duration > 0 && time / book.duration >= COMPLETION_THRESHOLD);
		const input = {
			bookUuid: book.uuid,
			currentTimeSeconds: done && status ? book.duration : time,
			durationSeconds: book.duration,
			playbackRate: this.snapshot.rate,
			listeningTimeSeconds: Math.max(0, listened),
			status: done ? ("completed" as const) : ("listening" as const),
		};
		const firstCompletion = done && !this.completed;
		// Offline the server never hears this; the next play resumes from it.
		if (this.localFiles) saveLocalPosition(book.uuid, input.currentTimeSeconds);
		this.completed = done;
		this.syncQueue = this.syncQueue.then(async () => {
			try {
				await this.deps.api.client.listeningProgress.saveProgress(input);
				const { orpc } = this.deps.api;
				void this.deps.queryClient.invalidateQueries({
					queryKey: orpc.listeningProgress.key(),
				});
				if (firstCompletion)
					void this.deps.queryClient.invalidateQueries({
						queryKey: orpc.recommendations.key(),
					});
			} catch {
				// Next tick retries with a fresher position.
			}
		});
		return this.syncQueue;
	}
}
