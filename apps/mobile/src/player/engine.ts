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
import {
	activeChapterIndex,
	type Chapter,
	clampSpeed,
	JUMP_BACK,
	JUMP_FORWARD,
	type SleepMode,
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
	playing: boolean;
	buffering: boolean;
	/** Position in the whole book, across files. */
	time: number;
	rate: number;
	sleep: SleepState | null;
	error: boolean;
	ended: boolean;
};

const SPEED_KEY = "nanahoshi.audio-speed";
const SYNC_INTERVAL_MS = 45_000;
const COMPLETION_THRESHOLD = 0.95;

type Deps = {
	serverUrl: string;
	auth: NanahoshiAuth;
	api: Api;
	queryClient: QueryClient;
};

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
		playing: false,
		buffering: false,
		time: 0,
		rate: readSpeed(),
		sleep: null,
		error: false,
		ended: false,
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
	private lastTick = Date.now();
	private completed = false;
	private sessionReady = false;
	private disposers: (() => void)[] = [];

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
		return () => {
			void this.sync();
			for (const dispose of this.disposers) dispose();
			this.player.clearLockScreenControls();
			this.player.remove();
		};
	}

	// ── loading ────────────────────────────────────────────────────────────
	/**
	 * Start (or resume) an audiobook from where the server says we left it.
	 * Read & Listen loads it paused (autoplay false) and starts it itself.
	 */
	async play(uuid: string, { autoplay = true }: { autoplay?: boolean } = {}) {
		if (this.snapshot.book?.uuid === uuid) {
			if (autoplay && !this.snapshot.playing) this.resume();
			return;
		}
		this.set({ loadingUuid: uuid, error: false });
		try {
			const { orpc, client } = this.deps.api;
			// A downloaded book plays from disk right away; the server is only
			// asked for the position, and not for long.
			const local = findDownloadedAudiobook(uuid);
			const [details, progress] = await Promise.all([
				local
					? null
					: this.deps.queryClient.ensureQueryData(
							orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
						),
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
			const rate =
				typeof serverRate === "number" && Number.isFinite(serverRate)
					? clampSpeed(serverRate)
					: this.snapshot.rate;
			// A finished book starts over rather than sitting on its last second.
			const saved = pickStartPosition(
				progress
					? {
							time: progress.currentTimeSeconds ?? 0,
							updatedAt: progress.lastListenedAt
								? Date.parse(progress.lastListenedAt)
								: null,
						}
					: null,
				local ? readLocalPosition(uuid) : null,
			);
			const finished = !saved.fromLocal && progress?.status === "completed";
			const start = finished || saved.time >= duration - 5 ? 0 : saved.time;
			this.completed = false;
			this.set({
				book,
				loadingUuid: null,
				time: start,
				rate,
				ended: false,
				sleep: null,
			});
			this.player.setActiveForLockScreen(true, this.lockScreenMetadata(book), {
				showSeekBackward: true,
				showSeekForward: true,
			});
			this.fileIndex = -1; // force the first file to load for this book
			await this.seek(start, autoplay);
			this.player.setPlaybackRate(rate);
			this.lastSyncAt = Date.now();
		} catch {
			this.set({ loadingUuid: null, error: true });
		}
	}

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
			artist: book.authors.join(", "),
			albumTitle: book.narrators.join(", ") || undefined,
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
			void this.seek(0, true);
			this.set({ ended: false });
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
		this.set({ time: target, ended: false });
		if (index !== this.fileIndex || !this.player.isLoaded) {
			await this.loadFile(index, within, autoplay);
		} else {
			await this.player.seekTo(within).catch(() => undefined);
			if (autoplay && !this.player.playing) this.player.play();
		}
		if (autoplay) this.set({ playing: true });
	};

	skip = (seconds: number) => void this.seek(this.snapshot.time + seconds);
	back = () => this.skip(-JUMP_BACK);
	forward = () => this.skip(JUMP_FORWARD);

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

	setRate = (value: number) => {
		const rate = clampSpeed(value);
		this.player.setPlaybackRate(rate);
		this.set({ rate });
		try {
			SecureStore.setItem(SPEED_KEY, String(rate));
		} catch {
			// Preference only.
		}
	};

	setSleep = (mode: SleepMode | null) => {
		this.set({
			sleep: mode ? { mode, remaining: this.sleepRemaining(mode) } : null,
		});
	};

	/** Close the player: save the position, drop the lock screen card. */
	stop = async () => {
		this.player.pause();
		await this.sync();
		this.player.clearLockScreenControls();
		this.player.replace(null);
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
			error: false,
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
			} else {
				this.set({ sleep: { ...sleep, remaining } });
			}
		}
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
