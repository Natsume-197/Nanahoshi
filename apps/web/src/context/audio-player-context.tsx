import { env } from "@nanahoshi-v2/env/web";
import { useRouter } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type BufferingIndicator,
	createBufferingIndicator,
} from "@/components/audio-player/buffering-indicator";
import { isReportableMediaError } from "@/components/audio-player/media-error";
import {
	planSeek,
	shouldApplyRestoredPosition,
	shouldFlushPendingSeek,
} from "@/components/audio-player/seek-plan";
import { usePlayerSync } from "@/components/audio-player/use-player-sync";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { invalidateListeningProgress } from "@/lib/invalidate-progress";
import { client } from "@/utils/orpc";

export interface AudiobookPlayerData {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor: string | null;
	duration: number | null;
	authors: { name: string }[];
	narrators: { name: string }[];
	chapters: {
		index: number;
		title: string | null;
		startTime: number;
		endTime: number;
	}[];
	audioFiles: { index: number; duration: number }[];
}

interface AudioPlayerState {
	audiobook: AudiobookPlayerData | null;
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	speed: number;
	volume: number;
	isLoading: boolean;
	// Playback started but is waiting on data (a seek into an unbuffered stretch,
	// or a slow connection). Distinct from `isLoading`, which covers opening a
	// book; this one only appears mid-playback and after a short grace period.
	isBuffering: boolean;
	currentFileIndex: number;
	globalCurrentTime: number;
	totalDuration: number;
	// The audiobook currently being loaded/buffered — from the play click (via
	// `signalPlayIntent`) through `canplay`. Lets a specific play button show a
	// spinner. Cleared on canplay or on a load/playback error.
	loadingUuid: string | null;
	// A stream/decode failure on the active audiobook. The compact player
	// stays mounted but flips to an error state (retry affordance) instead of
	// silently showing a play button that would fail again. Cleared on retry,
	// a successful load, or loading a different book.
	playbackError: boolean;
}

interface AudioPlayerActions {
	loadAudiobook: (
		audiobook: AudiobookPlayerData,
		options?: { autoplay?: boolean; startTime?: number },
	) => void;
	togglePlay: () => void;
	seekTo: (time: number) => void;
	seekRelative: (seconds: number) => void;
	setSpeed: (speed: number) => void;
	setVolume: (volume: number) => void;
	stop: () => void;
	pause: () => void;
	// Flag a play intent before the details fetch resolves, so the clicked play
	// button shows a spinner immediately (not only once the media starts loading).
	// Pass null to clear (e.g. the fetch failed).
	signalPlayIntent: (uuid: string | null) => void;
	// Re-attempt playback of the active book after a stream/decode error, from the
	// position it failed at.
	retry: () => void;
}

const VOLUME_STORAGE_KEY = "audio-volume";
// Remembers which audiobook was active so a full page reload can bring the mini
// player back (paused, at the server-saved position) instead of losing it.
const ACTIVE_BOOK_KEY = "audio-active-book";

function readStoredVolume(): number {
	if (typeof window === "undefined") return 1;
	const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
	const parsed = stored ? Number(stored) : 1;
	return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
}

function persistActiveBook(uuid: string | null) {
	if (typeof window === "undefined") return;
	if (uuid) {
		window.localStorage.setItem(ACTIVE_BOOK_KEY, uuid);
	} else {
		window.localStorage.removeItem(ACTIVE_BOOK_KEY);
	}
}

type AudiobookDetails = NonNullable<
	Awaited<ReturnType<typeof client.audiobooks.getDetails>>
>;

/** Map the audiobook detail payload to the shape the player consumes. */
export function toPlayerData(ab: AudiobookDetails): AudiobookPlayerData {
	return {
		uuid: ab.uuid,
		title: ab.title,
		filename: ab.filename,
		cover: ab.cover,
		mainColor: ab.mainColor,
		duration: ab.duration,
		authors: ab.authors?.map((a) => ({ name: a.name })) ?? [],
		narrators: ab.narrators?.map((n) => ({ name: n.name })) ?? [],
		chapters: (ab.chapters ?? []).map((ch) => ({
			index: ch.index,
			title: ch.title,
			startTime: ch.startTime,
			endTime: ch.endTime,
		})),
		audioFiles: (ab.audioFiles ?? []).map((f) => ({
			index: f.index,
			duration: f.duration,
		})),
	};
}

const AudioPlayerStateContext = createContext<AudioPlayerState | null>(null);
const AudioPlayerActionsContext = createContext<AudioPlayerActions | null>(
	null,
);
// Narrow subscription: only the loaded audiobook (or null). Its reference is
// stable between timeupdates, so consumers that just need to know "is something
// playing / which book" (e.g. the layout reserving the player bar's height) don't
// re-render on every playback tick the way `useAudioPlayerState` would.
const AudioPlayerBookContext = createContext<AudiobookPlayerData | null>(null);
// Narrow subscription: only the uuid currently loading (or null). Changes just
// twice per play (start → ready), never on playback ticks, so the many memoized
// book/resume cards that show a per-item play spinner don't re-render each tick.
const AudioPlayerLoadingContext = createContext<string | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
	const router = useRouter();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const hasMarkedListeningRef = useRef(false);

	const [audiobook, setAudiobook] = useState<AudiobookPlayerData | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [speed, setSpeedState] = useState(1);
	const [volume, setVolumeState] = useState(readStoredVolume);
	const [isLoading, setIsLoading] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [loadingUuid, setLoadingUuid] = useState<string | null>(null);
	const [playbackError, setPlaybackError] = useState(false);
	const [currentFileIndex, setCurrentFileIndex] = useState(0);

	// Refs that hold latest values for callbacks
	const audiobookRef = useRef<AudiobookPlayerData | null>(null);
	audiobookRef.current = audiobook;
	const currentFileIndexRef = useRef(0);
	currentFileIndexRef.current = currentFileIndex;
	const isPlayingRef = useRef(false);
	isPlayingRef.current = isPlaying;
	// Latest within-file position, so retry() can resume where the stream failed.
	const currentTimeRef = useRef(0);
	currentTimeRef.current = currentTime;
	const playbackErrorRef = useRef(false);
	playbackErrorRef.current = playbackError;

	// Precomputed file offsets and total duration for multi-file audiobooks
	const fileOffsetsRef = useRef<number[]>([]);
	const totalDurationRef = useRef(0);

	// Position (within the active file) to seek to once the media can accept it.
	// Setting currentTime before metadata loads only records a "default start
	// position" that the browser applies on play — so a paused restore would stay
	// at 0. We stash it here and apply it on loadedmetadata instead.
	const pendingSeekRef = useRef<number | null>(null);
	// Set once the user scrubs the current book, so an in-flight saved-position
	// fetch can't overwrite where they just went.
	const userSeekedRef = useRef(false);

	// Owns the stall-indicator timer. Shared by the media listeners and by
	// load/stop, so its internal state never drifts from `isBuffering`.
	const bufferingRef = useRef<BufferingIndicator | null>(null);
	if (bufferingRef.current == null) {
		bufferingRef.current = createBufferingIndicator(setIsBuffering);
	}

	const computeFileOffsets = useCallback(
		(audioFiles: AudiobookPlayerData["audioFiles"]) => {
			let offset = 0;
			fileOffsetsRef.current = audioFiles.map((f) => {
				const o = offset;
				offset += f.duration;
				return o;
			});
			totalDurationRef.current = offset;
		},
		[],
	);

	const isSingleFile = !audiobook || audiobook.audioFiles.length <= 1;

	const globalCurrentTime = isSingleFile
		? currentTime
		: (fileOffsetsRef.current[currentFileIndex] ?? 0) + currentTime;

	const totalDuration = isSingleFile ? duration : totalDurationRef.current;

	const getPlaybackState = useCallback(() => {
		const ab = audiobookRef.current;
		const single = !ab || ab.audioFiles.length <= 1;
		const ct = audioRef.current?.currentTime ?? 0;
		return {
			currentTime: single
				? ct
				: (fileOffsetsRef.current[currentFileIndexRef.current] ?? 0) + ct,
			duration: single
				? (audioRef.current?.duration ?? 0)
				: totalDurationRef.current,
		};
	}, []);

	usePlayerSync({
		bookUuid: audiobook?.uuid ?? "",
		enabled: !!audiobook && !isLoading,
		getPlaybackState,
	});

	const getStreamUrl = useCallback(
		(uuid: string, fileIndex: number) =>
			`${env.VITE_SERVER_URL}/stream/${uuid}/${fileIndex}`,
		[],
	);

	const attachAudioListeners = useCallback(
		(audio: HTMLAudioElement) => {
			const buffering = bufferingRef.current;
			if (!buffering) return;
			// Apply a position the media couldn't accept yet (fresh src, metadata
			// not loaded).
			const flushPendingSeek = () => {
				const target = pendingSeekRef.current;
				if (!shouldFlushPendingSeek(target, audio.readyState)) return;
				pendingSeekRef.current = null;
				audio.currentTime = target;
				setCurrentTime(audio.currentTime);
			};

			const handleCanPlay = () => {
				setIsLoading(false);
				setLoadingUuid(null);
				setPlaybackError(false);
				buffering.resume();
				if (audio.duration && Number.isFinite(audio.duration)) {
					setDuration(audio.duration);
				}
				flushPendingSeek();
			};

			// `waiting`/`stalled` while the element still intends to play: the
			// playhead is stuck on missing data. A paused element isn't stalled —
			// it's just paused — so it gets no indicator.
			const handleWaiting = () => {
				if (!audio.paused) buffering.stall();
			};
			// A real stream/decode failure — surface it and drop the loading state so
			// the play button doesn't spin forever. Ignore benign aborts fired by
			// src swaps (multi-file jumps) and stop() clearing the src.
			const handleError = () => {
				if (!isReportableMediaError(audio)) return;
				setIsLoading(false);
				setLoadingUuid(null);
				setIsPlaying(false);
				buffering.resume();
				// Keep the audiobook loaded so the player can offer a retry rather than
				// vanishing. No toast — the persistent in-player error state is the
				// signal, so we don't double up with a transient one.
				setPlaybackError(true);
			};
			const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
			// Covers the paused restore-after-reload case, where no play() would
			// otherwise flush the pending position.
			const handleLoadedMetadata = flushPendingSeek;
			const handlePlay = () => setIsPlaying(true);
			const handlePlaying = () => buffering.resume();
			const handlePause = () => {
				setIsPlaying(false);
				buffering.resume();
			};
			const handleEnded = () => {
				const ab = audiobookRef.current;
				if (!ab) return;
				const single = ab.audioFiles.length <= 1;
				const fileIdx = currentFileIndexRef.current;
				if (!single && fileIdx < ab.audioFiles.length - 1) {
					const nextIndex = fileIdx + 1;
					setCurrentFileIndex(nextIndex);
					audio.src = getStreamUrl(ab.uuid, nextIndex);
					audio.play();
				} else {
					setIsPlaying(false);
				}
			};

			audio.addEventListener("canplay", handleCanPlay);
			audio.addEventListener("error", handleError);
			audio.addEventListener("loadedmetadata", handleLoadedMetadata);
			audio.addEventListener("timeupdate", handleTimeUpdate);
			audio.addEventListener("play", handlePlay);
			audio.addEventListener("playing", handlePlaying);
			audio.addEventListener("waiting", handleWaiting);
			audio.addEventListener("stalled", handleWaiting);
			audio.addEventListener("pause", handlePause);
			audio.addEventListener("ended", handleEnded);

			return () => {
				audio.removeEventListener("canplay", handleCanPlay);
				audio.removeEventListener("error", handleError);
				audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
				audio.removeEventListener("timeupdate", handleTimeUpdate);
				audio.removeEventListener("play", handlePlay);
				audio.removeEventListener("playing", handlePlaying);
				audio.removeEventListener("waiting", handleWaiting);
				audio.removeEventListener("stalled", handleWaiting);
				audio.removeEventListener("pause", handlePause);
				audio.removeEventListener("ended", handleEnded);
				buffering.dispose();
			};
		},
		[getStreamUrl],
	);

	useMountEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.volume = volume;
		return attachAudioListeners(audio);
	});

	const retry = useCallback(() => {
		const audio = audioRef.current;
		const ab = audiobookRef.current;
		if (!audio || !ab) return;

		const fileIndex = currentFileIndexRef.current;
		const resumeAt = currentTimeRef.current;
		setPlaybackError(false);
		setIsLoading(true);
		setLoadingUuid(ab.uuid);
		// Reload the same file; pendingSeekRef restores the position once the media
		// can accept the seek (see handleLoadedMetadata).
		audio.src = getStreamUrl(ab.uuid, fileIndex);
		pendingSeekRef.current = resumeAt;
		audio.play().catch(() => {});
	}, [getStreamUrl]);

	const loadAudiobook = useCallback(
		(
			ab: AudiobookPlayerData,
			options?: { autoplay?: boolean; startTime?: number },
		) => {
			const autoplay = options?.autoplay ?? true;
			const audio = audioRef.current;
			if (!audio) return;

			if (audiobookRef.current?.uuid === ab.uuid) {
				// Same book already active. If it's in an error state, a fresh play
				// request means "retry"; otherwise there's nothing to load, so just drop
				// any pending spinner.
				setLoadingUuid(null);
				if (playbackErrorRef.current) retry();
				return;
			}

			persistActiveBook(ab.uuid);
			setIsLoading(true);
			setLoadingUuid(ab.uuid);
			setPlaybackError(false);
			setIsPlaying(false);
			setCurrentTime(0);
			setCurrentFileIndex(0);
			setSpeedState(1);
			audio.playbackRate = 1;
			hasMarkedListeningRef.current = false;
			userSeekedRef.current = false;
			bufferingRef.current?.resume();

			computeFileOffsets(ab.audioFiles);

			const single = ab.audioFiles.length <= 1;
			const totalDur = single
				? (ab.duration ?? 0)
				: ab.audioFiles.reduce((sum, f) => sum + f.duration, 0);
			setDuration(totalDur);

			setAudiobook(ab);

			audio.src = getStreamUrl(ab.uuid, 0);

			// Resolve a global position to a within-file position (switching src for
			// multi-file books), then hand it to pendingSeekRef so it's applied the
			// moment the media can seek — see handleLoadedMetadata.
			const applyStartPosition = (globalTime: number) => {
				let target = globalTime;
				let srcSwapped = false;
				if (!single) {
					let remaining = globalTime;
					for (let i = 0; i < ab.audioFiles.length; i++) {
						if (remaining <= ab.audioFiles[i].duration) {
							if (i !== 0) {
								setCurrentFileIndex(i);
								audio.src = getStreamUrl(ab.uuid, i);
								srcSwapped = true;
							}
							target = remaining;
							break;
						}
						remaining -= ab.audioFiles[i].duration;
					}
				}
				pendingSeekRef.current = target;
				// Seek now only if the current media is already seekable and we didn't
				// just swap src; otherwise handleLoadedMetadata flushes it once
				// (re)loaded.
				if (!srcSwapped && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
					pendingSeekRef.current = null;
					audio.currentTime = target;
				}
				setCurrentTime(target);
			};

			// An explicit startTime (chapter jump, or the saved position fetched in
			// parallel by usePlayAudiobook) starts playback without extra round
			// trips; the getProgress fallback covers callers that don't pass one.
			if (options?.startTime != null) {
				applyStartPosition(options.startTime);
				if (autoplay) audio.play().catch(() => {});
			} else {
				client.listeningProgress
					.getProgress({ bookUuid: ab.uuid })
					.then((progress) => {
						const saved = progress?.currentTimeSeconds;
						if (
							shouldApplyRestoredPosition({
								userSeeked: userSeekedRef.current,
								savedSeconds: saved,
							})
						) {
							applyStartPosition(saved as number);
						}
					})
					.catch(() => {})
					.then(() => {
						if (autoplay) audio.play().catch(() => {});
					});
			}

			// Mark as listening (only on a real play; a reload-restore is already
			// "listening" and shouldn't re-write status / invalidate the router).
			if (autoplay && !hasMarkedListeningRef.current) {
				hasMarkedListeningRef.current = true;
				client.listeningProgress
					.saveProgress({
						bookUuid: ab.uuid,
						status: "listening",
					})
					.then(() => {
						invalidateListeningProgress();
						router.invalidate();
					})
					.catch(() => {});
			}
		},
		[computeFileOffsets, getStreamUrl, router, retry],
	);

	// Restore the last active audiobook after a full page reload: bring the mini
	// player back paused, at the server-saved position. Autoplay is intentionally
	// off — browsers block sound on load without a user gesture, and resuming
	// audio unprompted is jarring.
	useMountEffect(() => {
		if (typeof window === "undefined") return;
		const uuid = window.localStorage.getItem(ACTIVE_BOOK_KEY);
		if (!uuid) return;
		let cancelled = false;
		client.audiobooks
			.getDetails({ uuid })
			.then((details) => {
				if (cancelled || !details) return;
				loadAudiobook(toPlayerData(details), { autoplay: false });
			})
			.catch(() => {
				// Book gone (deleted / no access): drop the stale pointer.
				persistActiveBook(null);
			});
		return () => {
			cancelled = true;
		};
	});

	const togglePlay = useCallback(() => {
		const audio = audioRef.current;
		if (!audio) return;
		if (audio.paused) {
			audio.play();
		} else {
			audio.pause();
		}
	}, []);

	const seekTo = useCallback(
		(time: number) => {
			const audio = audioRef.current;
			const ab = audiobookRef.current;
			if (!audio || !ab) return;

			userSeekedRef.current = true;

			const plan = planSeek({
				time,
				offsets: fileOffsetsRef.current,
				totalDuration: totalDurationRef.current,
				fileCount: ab.audioFiles.length,
				currentFileIndex: currentFileIndexRef.current,
				readyState: audio.readyState,
				mediaDuration: audio.duration,
				bookDuration: ab.duration,
			});

			if (plan.srcSwap) {
				setCurrentFileIndex(plan.fileIndex);
				audio.src = getStreamUrl(ab.uuid, plan.fileIndex);
			}

			if (plan.deferred) {
				// Media can't accept the seek yet — handleLoadedMetadata flushes it.
				pendingSeekRef.current = plan.fileTime;
			} else {
				pendingSeekRef.current = null;
				audio.currentTime = plan.fileTime;
			}

			// Reflect the seek in React state immediately so the seek bar doesn't
			// snap back to the old position while the media catches up.
			setCurrentTime(plan.fileTime);

			if (plan.srcSwap && isPlayingRef.current) audio.play().catch(() => {});
		},
		[getStreamUrl],
	);

	const seekRelative = useCallback(
		(seconds: number) => {
			const ct = audioRef.current?.currentTime ?? 0;
			const ab = audiobookRef.current;
			const single = !ab || ab.audioFiles.length <= 1;
			const gt = single
				? ct
				: (fileOffsetsRef.current[currentFileIndexRef.current] ?? 0) + ct;
			seekTo(gt + seconds);
		},
		[seekTo],
	);

	const setSpeed = useCallback((newSpeed: number) => {
		setSpeedState(newSpeed);
		if (audioRef.current) {
			audioRef.current.playbackRate = newSpeed;
		}
	}, []);

	const setVolume = useCallback((newVolume: number) => {
		const clamped = Math.min(1, Math.max(0, newVolume));
		setVolumeState(clamped);
		if (audioRef.current) audioRef.current.volume = clamped;
		if (typeof window !== "undefined") {
			window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
		}
	}, []);

	const signalPlayIntent = useCallback((uuid: string | null) => {
		setLoadingUuid(uuid);
	}, []);

	const pause = useCallback(() => {
		audioRef.current?.pause();
	}, []);

	const stop = useCallback(() => {
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
		}
		setAudiobook(null);
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);
		setCurrentFileIndex(0);
		setIsLoading(true);
		setLoadingUuid(null);
		setPlaybackError(false);
		bufferingRef.current?.resume();
		hasMarkedListeningRef.current = false;
		persistActiveBook(null);
	}, []);

	const state = useMemo<AudioPlayerState>(
		() => ({
			audiobook,
			isPlaying,
			currentTime,
			duration,
			speed,
			volume,
			isLoading,
			isBuffering,
			currentFileIndex,
			globalCurrentTime,
			totalDuration,
			loadingUuid,
			playbackError,
		}),
		[
			audiobook,
			isPlaying,
			currentTime,
			duration,
			speed,
			volume,
			isLoading,
			isBuffering,
			currentFileIndex,
			globalCurrentTime,
			totalDuration,
			loadingUuid,
			playbackError,
		],
	);

	const actions = useMemo<AudioPlayerActions>(
		() => ({
			loadAudiobook,
			togglePlay,
			seekTo,
			seekRelative,
			setSpeed,
			setVolume,
			stop,
			pause,
			signalPlayIntent,
			retry,
		}),
		[
			loadAudiobook,
			togglePlay,
			seekTo,
			seekRelative,
			setSpeed,
			setVolume,
			stop,
			pause,
			signalPlayIntent,
			retry,
		],
	);

	return (
		<AudioPlayerStateContext.Provider value={state}>
			<AudioPlayerActionsContext.Provider value={actions}>
				<AudioPlayerBookContext.Provider value={audiobook}>
					<AudioPlayerLoadingContext.Provider value={loadingUuid}>
						{/* biome-ignore lint/a11y/useMediaCaption: audio player for user's own audiobooks */}
						<audio ref={audioRef} preload="auto" />
						{children}
					</AudioPlayerLoadingContext.Provider>
				</AudioPlayerBookContext.Provider>
			</AudioPlayerActionsContext.Provider>
		</AudioPlayerStateContext.Provider>
	);
}

export function useAudioPlayerState(): AudioPlayerState {
	const ctx = useContext(AudioPlayerStateContext);
	if (!ctx)
		throw new Error(
			"useAudioPlayerState must be used inside <AudioPlayerProvider>",
		);
	return ctx;
}

export function useAudioPlayerActions(): AudioPlayerActions {
	const ctx = useContext(AudioPlayerActionsContext);
	if (!ctx)
		throw new Error(
			"useAudioPlayerActions must be used inside <AudioPlayerProvider>",
		);
	return ctx;
}

/**
 * The loaded audiobook (or null) without subscribing to playback ticks. Use this
 * over `useAudioPlayerState` when you only care about which book is active — it
 * won't re-render on every timeupdate.
 */
export function useAudioPlayerBook(): AudiobookPlayerData | null {
	return useContext(AudioPlayerBookContext);
}

/**
 * True while `uuid`'s audiobook is being loaded/buffered for playback. Backed by
 * a narrow context that only changes at load start/ready, so a memoized card can
 * show a play-button spinner without re-rendering on every playback tick.
 */
export function useIsAudiobookLoading(uuid: string): boolean {
	return useContext(AudioPlayerLoadingContext) === uuid;
}
