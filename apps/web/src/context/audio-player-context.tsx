import { env } from "@nanahoshi/env/web";
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
	clearMediaSession,
	registerMediaSessionHandlers,
	setMediaSessionMetadata,
	setMediaSessionPlaybackState,
	setMediaSessionPosition,
} from "@/components/audio-player/media-session";
import {
	clampSpeed,
	clampVolume,
	clearSpeedForBook,
	type JumpAmount,
	persistActiveBook,
	persistAutoplayNext,
	persistJumpBack,
	persistJumpForward,
	persistSpeed,
	persistSpeedForBook,
	persistVolume,
	readActiveBook,
	readStoredAutoplayNext,
	readStoredJumpBack,
	readStoredJumpForward,
	readStoredSpeed,
	readStoredSpeedForBook,
	readStoredVolume,
} from "@/components/audio-player/player-preferences";
import {
	effectiveMediaTime,
	planSeek,
	shouldApplyRestoredPosition,
	shouldConfirmPendingSeek,
	shouldFlushPendingSeek,
} from "@/components/audio-player/seek-plan";
import {
	createSleepTimer,
	extendSleepTimer,
	type SleepTimerMode,
	type SleepTimerState,
	sleepFadeFactor,
	tickSleepTimer,
} from "@/components/audio-player/sleep-timer";
import { computeSmartRewind } from "@/components/audio-player/smart-rewind";
import {
	findNextInSeries,
	nextTrackPosition,
} from "@/components/audio-player/track-transition";
import { usePlayerSync } from "@/components/audio-player/use-player-sync";
import { useInterval } from "@/hooks/use-interval";
import { useMountEffect } from "@/hooks/use-mount-effect";
import {
	invalidateListeningProgress,
	invalidateRecommendations,
} from "@/lib/invalidate-progress";
import { formatChapterLabel, getActiveChapterIndex } from "@/utils/chapters";
import { formatNames } from "@/utils/format";
import { client } from "@/utils/orpc";

export interface AudiobookPlayerData {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor: string | null;
	duration: number | null;
	seriesUuid: string | null;
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

export interface UpNextBook {
	uuid: string;
	title: string | null;
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
	// Chapter under the playhead, resolved once per tick: every consumer that
	// used to scan the chapter list itself reads this instead.
	activeChapterIndex: number;
	// Derived once so the bar, the transport and the expanded player can never
	// disagree about which state the play control is in.
	showError: boolean;
	showBuffering: boolean;
	// The audiobook currently being loaded/buffered — from the play click (via
	// `signalPlayIntent`) through `canplay`. Lets a specific play button show a
	// spinner. Cleared on canplay or on a load/playback error.
	loadingUuid: string | null;
	// A stream/decode failure on the active audiobook. The compact player
	// stays mounted but flips to an error state (retry affordance) instead of
	// silently showing a play button that would fail again. Cleared on retry,
	// a successful load, or loading a different book.
	playbackError: boolean;
	jumpBack: JumpAmount;
	jumpForward: JumpAmount;
	sleepTimer: SleepTimerState | null;
	/** Global default speed (last speed set anywhere). */
	defaultSpeed: number;
	/** True when the book plays at its own remembered speed, not the default. */
	speedIsOverride: boolean;
	autoplayNext: boolean;
	upNext: UpNextBook | null;
	/** Last file ended with nothing more to auto-play. */
	bookEnded: boolean;
}

interface AudioPlayerActions {
	loadAudiobook: (
		audiobook: AudiobookPlayerData,
		options?: { autoplay?: boolean; startTime?: number; speed?: number },
	) => void;
	togglePlay: () => void;
	play: () => void;
	pause: () => void;
	seekTo: (time: number) => void;
	seekRelative: (seconds: number) => void;
	/** Imperative snapshot for navigation flows that must not subscribe to ticks. */
	getGlobalCurrentTime: () => number;
	setSpeed: (speed: number) => void;
	setVolume: (volume: number) => void;
	stop: () => void;
	// Flag a play intent before the details fetch resolves, so the clicked play
	// button shows a spinner immediately (not only once the media starts loading).
	// Pass null to clear (e.g. the fetch failed).
	signalPlayIntent: (uuid: string | null) => void;
	// Re-attempt playback of the active book after a stream/decode error, from the
	// position it failed at.
	retry: () => void;
	skipChapter: (direction: -1 | 1) => void;
	setJumpBack: (seconds: JumpAmount) => void;
	setJumpForward: (seconds: JumpAmount) => void;
	startSleepTimer: (mode: SleepTimerMode) => void;
	extendSleep: () => void;
	cancelSleepTimer: () => void;
	setExpanded: (expanded: boolean) => void;
	/** Clear this book's override and return to the global default speed. */
	useDefaultSpeed: () => void;
	setAutoplayNext: (enabled: boolean) => void;
	/** Advance to the next book in the series. Resolves false when none. */
	playNextInSeries: () => Promise<boolean>;
	/** Restart the finished book from zero and clear the ended state. */
	replayBook: () => void;
	dismissBookEnded: () => void;
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
		seriesUuid: ab.series?.uuid ?? null,
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
// Narrow subscription: which book is loaded and whether it's playing. Flips
// only on play/pause/load, so resume cards can show a now-playing equalizer
// without re-rendering on every playback tick.
const AudioPlayerNowPlayingContext = createContext<{
	uuid: string;
	isPlaying: boolean;
} | null>(null);
const AudioPlayerExpandedContext = createContext(false);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const [audiobook, setAudiobook] = useState<AudiobookPlayerData | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [speed, setSpeedState] = useState(readStoredSpeed);
	const [volume, setVolumeState] = useState(readStoredVolume);
	const [isLoading, setIsLoading] = useState(true);
	const [isBuffering, setIsBuffering] = useState(false);
	const [loadingUuid, setLoadingUuid] = useState<string | null>(null);
	const [playbackError, setPlaybackError] = useState(false);
	const [currentFileIndex, setCurrentFileIndex] = useState(0);
	const [jumpBack, setJumpBackState] = useState<JumpAmount>(readStoredJumpBack);
	const [jumpForward, setJumpForwardState] = useState<JumpAmount>(
		readStoredJumpForward,
	);
	const [sleepTimer, setSleepTimer] = useState<SleepTimerState | null>(null);
	const [defaultSpeed, setDefaultSpeed] = useState(readStoredSpeed);
	const [speedIsOverride, setSpeedIsOverride] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [autoplayNext, setAutoplayNextState] = useState(readStoredAutoplayNext);
	const [upNext, setUpNext] = useState<UpNextBook | null>(null);
	const [bookEnded, setBookEnded] = useState(false);

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
	const speedRef = useRef(speed);
	speedRef.current = speed;
	// The level a sleep-timer fade ramps against.
	const volumeRef = useRef(volume);
	volumeRef.current = volume;
	const jumpBackRef = useRef(jumpBack);
	jumpBackRef.current = jumpBack;
	const jumpForwardRef = useRef(jumpForward);
	jumpForwardRef.current = jumpForward;
	const mediaChapterRef = useRef(-1);
	const mediaSecondRef = useRef(-1);

	// Precomputed file offsets and total duration for multi-file audiobooks
	const fileOffsetsRef = useRef<number[]>([]);
	const totalDurationRef = useRef(0);
	// Timestamp of the last pause, for smart-rewind on resume.
	const pausedAtRef = useRef<number | null>(null);
	// Gapless handoff: hidden element preloading the next file's stream.
	const preloadRef = useRef<HTMLAudioElement | null>(null);
	const preloadedFileRef = useRef<string | null>(null);
	// Up Next is resolved once per book to avoid refetching on every tick.
	const upNextResolvedForRef = useRef<string | null>(null);
	const autoplayNextRef = useRef(autoplayNext);
	autoplayNextRef.current = autoplayNext;
	const upNextRef = useRef<UpNextBook | null>(null);
	upNextRef.current = upNext;
	// End-of-book handoff, assigned after loadAudiobook exists (listeners call
	// it through the ref to avoid a dependency cycle).
	const advanceRef = useRef<() => Promise<void>>(async () => {});
	// seekTo is defined below replayBook; the ref keeps the closure fresh.
	const seekToRef = useRef<(time: number) => void>(() => {});

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

	const activeChapterIndex = getActiveChapterIndex(
		audiobook?.chapters ?? [],
		globalCurrentTime,
	);
	// After a stream failure the play control becomes a retry; a stall only shows
	// once loading and error states have had their turn.
	const showError = playbackError && !isLoading;
	const showBuffering = isBuffering && !isLoading && !showError;

	const getPlaybackState = useCallback(() => {
		const ab = audiobookRef.current;
		const single = !ab || ab.audioFiles.length <= 1;
		const ct = effectiveMediaTime(
			audioRef.current?.currentTime ?? 0,
			pendingSeekRef.current,
		);
		return {
			currentTime: single
				? ct
				: (fileOffsetsRef.current[currentFileIndexRef.current] ?? 0) + ct,
			duration: single
				? (audioRef.current?.duration ?? 0)
				: totalDurationRef.current,
			playbackRate: speedRef.current,
		};
	}, []);
	const getGlobalCurrentTime = useCallback(
		() => getPlaybackState().currentTime,
		[getPlaybackState],
	);

	const { binding: playbackSync } = usePlayerSync({
		bookUuid: audiobook?.uuid ?? "",
		enabled: !!audiobook && !isLoading,
		active: isPlaying && !isLoading,
		getPlaybackState,
	});

	const getStreamUrl = useCallback(
		(uuid: string, fileIndex: number) =>
			`${env.VITE_SERVER_URL}/stream/${uuid}/${fileIndex}`,
		[],
	);

	// Best-effort preload of a stream so the next handoff starts from the HTTP
	// cache instead of a cold connection. Never blocks playback on failure.
	const ensureFilePreloaded = useCallback(
		(uuid: string, fileIndex: number) => {
			const key = `${uuid}:${fileIndex}`;
			if (preloadedFileRef.current === key) return;
			preloadedFileRef.current = key;
			try {
				const el = new Audio();
				el.preload = "auto";
				el.src = getStreamUrl(uuid, fileIndex);
				preloadRef.current = el;
			} catch {
				// Preloading is opportunistic; ignore.
			}
		},
		[getStreamUrl],
	);

	// Resolve the next book in the series once per book (Up Next). The listing
	// already comes back in canonical order — never re-sort here.
	const resolveUpNext = useCallback(async () => {
		const ab = audiobookRef.current;
		if (!ab?.seriesUuid) return;
		if (upNextResolvedForRef.current === ab.uuid) return;
		upNextResolvedForRef.current = ab.uuid;
		try {
			const list = await client.audiobooks.listBySeries({
				seriesUuid: ab.seriesUuid,
			});
			const current = audiobookRef.current;
			if (!current || current.uuid !== ab.uuid) return;
			const found = findNextInSeries({
				currentUuid: ab.uuid,
				seriesBooks: list,
			});
			if (!found) return;
			setUpNext({ uuid: found.uuid, title: found.title ?? null });
			ensureFilePreloaded(found.uuid, 0);
		} catch {
			// Up Next is a hint; playback never depends on it.
		}
	}, [ensureFilePreloaded]);

	const pushMediaSessionState = useCallback(() => {
		const ab = audiobookRef.current;
		if (!ab) return;
		const { currentTime: position, duration: total } = getPlaybackState();
		// timeupdate fires ~4×/s for an OS readout that shows whole seconds.
		const second = Math.floor(position);
		if (second === mediaSecondRef.current) return;
		mediaSecondRef.current = second;
		setMediaSessionPosition({
			duration: total,
			position,
			playbackRate: speedRef.current,
		});
		if (ab.chapters.length === 0) return;
		const chapterIndex = getActiveChapterIndex(ab.chapters, position);
		if (chapterIndex === mediaChapterRef.current) return;
		mediaChapterRef.current = chapterIndex;
		setMediaSessionMetadata({
			title: ab.title ?? ab.filename,
			artist: formatNames(ab.authors) ?? "",
			album:
				chapterIndex >= 0
					? formatChapterLabel(ab.chapters[chapterIndex], chapterIndex)
					: (formatNames(ab.narrators) ?? ""),
			cover: ab.cover,
		});
	}, [getPlaybackState]);

	const attachAudioListeners = useCallback(
		(audio: HTMLAudioElement) => {
			const buffering = bufferingRef.current;
			if (!buffering) return;
			// Apply a position the media couldn't accept yet (fresh src, metadata
			// not loaded).
			const flushPendingSeek = () => {
				const target = pendingSeekRef.current;
				if (!shouldFlushPendingSeek(target, audio.readyState)) return;
				audio.currentTime = target;
				// Keep the requested value visible until a media event confirms it;
				// an early currentTime assignment can otherwise flash correctly and
				// then rebound to zero while the stream becomes seekable.
				setCurrentTime(target);
			};
			const acknowledgePendingSeek = () => {
				const target = pendingSeekRef.current;
				if (target == null) return false;
				if (
					!shouldConfirmPendingSeek(target, audio.currentTime, audio.readyState)
				)
					return false;
				pendingSeekRef.current = null;
				return true;
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
				acknowledgePendingSeek();
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
			const handleTimeUpdate = () => {
				if (pendingSeekRef.current != null) {
					if (!acknowledgePendingSeek()) {
						flushPendingSeek();
						return;
					}
				}
				setCurrentTime(audio.currentTime);
				pushMediaSessionState();
				// Gapless handoff: while the tail of a file plays, warm the next
				// stream; near the end of the book, resolve Up Next so the next
				// book's first file is warm too.
				const ab = audiobookRef.current;
				if (ab && ab.audioFiles.length > 1) {
					const idx = currentFileIndexRef.current;
					const offsets = fileOffsetsRef.current;
					const fileStart = offsets[idx] ?? 0;
					const fileDur = ab.audioFiles[idx]?.duration ?? 0;
					const globalPos = fileStart + audio.currentTime;
					const inFileRemaining = fileStart + fileDur - globalPos;
					if (inFileRemaining < 60 && idx + 1 < ab.audioFiles.length) {
						ensureFilePreloaded(ab.uuid, idx + 1);
					}
					const total = totalDurationRef.current;
					if (
						autoplayNextRef.current &&
						ab.seriesUuid &&
						total > 0 &&
						total - globalPos < 300
					) {
						void resolveUpNext();
					}
				} else if (ab) {
					const total = totalDurationRef.current || audio.duration || 0;
					if (
						autoplayNextRef.current &&
						ab.seriesUuid &&
						total > 0 &&
						total - audio.currentTime < 300
					) {
						void resolveUpNext();
					}
				}
			};
			const handleSeeked = () => {
				if (!acknowledgePendingSeek()) return;
				setCurrentTime(audio.currentTime);
				pushMediaSessionState();
			};
			// Covers the paused restore-after-reload case, where no play() would
			// otherwise flush the pending position.
			const handleLoadedMetadata = flushPendingSeek;
			const handlePlay = () => {
				// Smart rewind: after a long pause the listener lost context, so
				// back up a few seconds instead of resuming mid-sentence.
				if (pausedAtRef.current != null) {
					const pausedMs = Date.now() - pausedAtRef.current;
					pausedAtRef.current = null;
					const rewind = computeSmartRewind({
						pausedMs,
						currentTime: audio.currentTime,
					});
					if (rewind > 0) {
						const target = Math.max(0, audio.currentTime - rewind);
						try {
							audio.currentTime = target;
						} catch {
							// Media not seekable yet; keep the live position.
						}
						setCurrentTime(target);
					}
				}
				setIsPlaying(true);
				setMediaSessionPlaybackState("playing");
			};
			const handlePlaying = () => buffering.resume();
			const handlePause = () => {
				pausedAtRef.current = Date.now();
				setIsPlaying(false);
				setMediaSessionPlaybackState("paused");
				buffering.resume();
			};
			const handleEnded = () => {
				const ab = audiobookRef.current;
				if (!ab) return;
				const fileIdx = currentFileIndexRef.current;
				const next = nextTrackPosition({
					currentFileIndex: fileIdx,
					audioFileCount: ab.audioFiles.length,
				});
				if (next) {
					currentTimeRef.current = next.currentTime;
					setCurrentTime(next.currentTime);
					setCurrentFileIndex(next.fileIndex);
					preloadedFileRef.current = `${ab.uuid}:${next.fileIndex}`;
					audio.src = getStreamUrl(ab.uuid, next.fileIndex);
					audio.play();
				} else {
					// End of the book: try the series handoff, else the ended UI.
					void advanceRef.current();
				}
			};

			audio.addEventListener("canplay", handleCanPlay);
			audio.addEventListener("error", handleError);
			audio.addEventListener("loadedmetadata", handleLoadedMetadata);
			audio.addEventListener("seeked", handleSeeked);
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
				audio.removeEventListener("seeked", handleSeeked);
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
		[ensureFilePreloaded, getStreamUrl, pushMediaSessionState, resolveUpNext],
	);

	useMountEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.volume = volume;
		return attachAudioListeners(audio);
	});

	// Apply a book's own remembered speed (server or local override). The
	// global default is untouched: it only changes on an explicit setSpeed.
	const applyBookSpeed = useCallback(
		(uuid: string, rate: number, isOverride: boolean) => {
			const clamped = clampSpeed(rate);
			setSpeedState(clamped);
			speedRef.current = clamped;
			if (audioRef.current) audioRef.current.playbackRate = clamped;
			persistSpeedForBook(uuid, clamped);
			setSpeedIsOverride(isOverride);
		},
		[],
	);

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
			options?: { autoplay?: boolean; startTime?: number; speed?: number },
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
			setBookEnded(false);
			setUpNext(null);
			upNextResolvedForRef.current = null;
			preloadedFileRef.current = null;
			preloadRef.current = null;
			setCurrentTime(0);
			setCurrentFileIndex(0);
			pendingSeekRef.current = null;
			pausedAtRef.current = null;
			// Per-book speed wins; otherwise the global setting carries over. An
			// explicit server rate (cross-device override) wins over both. A
			// sleep-timer fade may also have left the element quiet.
			const globalSpeed = readStoredSpeed();
			setDefaultSpeed(globalSpeed);
			if (options?.speed != null && Number.isFinite(options.speed)) {
				applyBookSpeed(ab.uuid, options.speed, options.speed !== globalSpeed);
			} else {
				const localOverride = readStoredSpeedForBook(ab.uuid);
				const nextSpeed = localOverride ?? globalSpeed;
				setSpeedState(nextSpeed);
				speedRef.current = nextSpeed;
				setSpeedIsOverride(
					localOverride != null && localOverride !== globalSpeed,
				);
			}
			audio.playbackRate = speedRef.current;
			audio.volume = volumeRef.current;
			userSeekedRef.current = false;
			mediaChapterRef.current = -1;
			mediaSecondRef.current = -1;
			bufferingRef.current?.resume();
			setMediaSessionMetadata({
				title: ab.title ?? ab.filename,
				artist: formatNames(ab.authors) ?? "",
				album: formatNames(ab.narrators) ?? "",
				cover: ab.cover,
			});

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
				// (re)loaded. The request remains pending until seeked/timeupdate
				// acknowledges it, because assignment alone is not reliable during load.
				if (!srcSwapped && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
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
						// The book may have changed while the fetch was in flight.
						if (audiobookRef.current?.uuid !== ab.uuid) return;
						const saved = progress?.currentTimeSeconds;
						if (
							shouldApplyRestoredPosition({
								userSeeked: userSeekedRef.current,
								savedSeconds: saved,
							})
						) {
							applyStartPosition(saved as number);
						}
						// Server override (set on another device) wins over local.
						const serverRate = progress?.playbackRate;
						if (typeof serverRate === "number" && Number.isFinite(serverRate)) {
							applyBookSpeed(
								ab.uuid,
								serverRate,
								clampSpeed(serverRate) !== readStoredSpeed(),
							);
						}
					})
					.catch(() => {})
					.then(() => {
						if (autoplay) audio.play().catch(() => {});
					});
			}
		},
		[applyBookSpeed, computeFileOffsets, getStreamUrl, retry],
	);

	// Advance to the next book in the series, loading its details fresh so the
	// player state (chapters, files, series link) is complete. Prefers the
	// already-resolved Up Next hint; falls back to a live series listing.
	const playNextInSeries = useCallback(async (): Promise<boolean> => {
		const ab = audiobookRef.current;
		if (!ab?.seriesUuid) return false;
		try {
			let next = upNextRef.current;
			if (!next || upNextResolvedForRef.current !== ab.uuid) {
				const list = await client.audiobooks.listBySeries({
					seriesUuid: ab.seriesUuid,
				});
				const found = findNextInSeries({
					currentUuid: ab.uuid,
					seriesBooks: list,
				});
				if (!found) return false;
				next = { uuid: found.uuid, title: found.title ?? null };
			}
			const details = await client.audiobooks.getDetails({
				uuid: next.uuid,
			});
			if (!details) return false;
			loadAudiobook(toPlayerData(details), { startTime: 0 });
			return true;
		} catch {
			return false;
		}
	}, [loadAudiobook]);

	// Persist the finished state ( completion drives recommendations) without
	// waiting for the next 45s sync tick.
	const markBookCompleted = useCallback(() => {
		const ab = audiobookRef.current;
		if (!ab) return;
		const total = totalDurationRef.current || 0;
		client.listeningProgress
			.saveProgress(
				{
					bookUuid: ab.uuid,
					currentTimeSeconds: total,
					durationSeconds: total,
					status: "completed",
				},
				{ context: { keepalive: true } },
			)
			.then(() => {
				invalidateListeningProgress();
				invalidateRecommendations();
			})
			.catch(() => {});
	}, []);

	const finishCurrentBook = useCallback(async () => {
		const ab = audiobookRef.current;
		if (!ab) return;
		markBookCompleted();
		if (autoplayNextRef.current && ab.seriesUuid) {
			const advanced = await playNextInSeries();
			if (advanced) return;
		}
		setIsPlaying(false);
		setMediaSessionPlaybackState("paused");
		setBookEnded(true);
	}, [markBookCompleted, playNextInSeries]);

	// Keep the media listeners' handoff pointed at the latest closure.
	advanceRef.current = finishCurrentBook;

	const replayBook = useCallback(() => {
		setBookEnded(false);
		seekToRef.current(0);
		audioRef.current?.play().catch(() => {});
	}, []);

	const dismissBookEnded = useCallback(() => {
		setBookEnded(false);
	}, []);

	const setAutoplayNext = useCallback(
		(enabled: boolean) => {
			setAutoplayNextState(enabled);
			persistAutoplayNext(enabled);
			if (enabled) void resolveUpNext();
		},
		[resolveUpNext],
	);

	// Restore the last active audiobook after a full page reload: bring the mini
	// player back paused, at the server-saved position. Autoplay is intentionally
	// off — browsers block sound on load without a user gesture, and resuming
	// audio unprompted is jarring.
	useMountEffect(() => {
		const uuid = readActiveBook();
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
	const play = useCallback(() => {
		audioRef.current?.play().catch(() => {});
	}, []);
	const pause = useCallback(() => {
		audioRef.current?.pause();
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

			// Retain every request until a media progress event acknowledges it.
			// Even with metadata loaded, a fresh stream may briefly accept the
			// assignment and then reset to zero before its ranges are seekable.
			pendingSeekRef.current = plan.fileTime;
			if (!plan.deferred) {
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
	seekToRef.current = seekTo;

	// Back restarts the current chapter unless the playhead just entered it.
	const skipChapter = useCallback(
		(direction: -1 | 1) => {
			const ab = audiobookRef.current;
			if (!ab || ab.chapters.length === 0) return;
			const position = getPlaybackState().currentTime;
			const index = getActiveChapterIndex(ab.chapters, position);
			if (direction === -1) {
				const start = ab.chapters[Math.max(0, index)]?.startTime ?? 0;
				const atChapterHead = position - start < 3;
				seekTo(
					atChapterHead && index > 0
						? (ab.chapters[index - 1]?.startTime ?? 0)
						: start,
				);
				return;
			}
			const next = ab.chapters[index + 1];
			if (next) seekTo(next.startTime);
		},
		[getPlaybackState, seekTo],
	);

	const setSpeed = useCallback((newSpeed: number) => {
		const clamped = clampSpeed(newSpeed);
		setSpeedState(clamped);
		speedRef.current = clamped;
		setDefaultSpeed(clamped);
		// An explicit change becomes both the new global default and this
		// book's override, so they agree and no override badge shows.
		setSpeedIsOverride(false);
		if (audioRef.current) {
			audioRef.current.playbackRate = clamped;
		}
		persistSpeed(clamped);
		const uuid = audiobookRef.current?.uuid;
		if (!uuid) return;
		persistSpeedForBook(uuid, clamped);
		client.listeningProgress
			.saveProgress(
				{ bookUuid: uuid, playbackRate: clamped },
				{ context: { keepalive: true } },
			)
			.catch(() => {});
	}, []);

	const useDefaultSpeed = useCallback(() => {
		const uuid = audiobookRef.current?.uuid;
		const def = readStoredSpeed();
		setSpeedState(def);
		speedRef.current = def;
		setSpeedIsOverride(false);
		if (audioRef.current) audioRef.current.playbackRate = def;
		if (!uuid) return;
		clearSpeedForBook(uuid);
		// Mirror the default server-side so other devices drop the override too.
		client.listeningProgress
			.saveProgress(
				{ bookUuid: uuid, playbackRate: def },
				{ context: { keepalive: true } },
			)
			.catch(() => {});
	}, []);

	const setJumpBack = useCallback((seconds: JumpAmount) => {
		setJumpBackState(seconds);
		persistJumpBack(seconds);
	}, []);

	const setJumpForward = useCallback((seconds: JumpAmount) => {
		setJumpForwardState(seconds);
		persistJumpForward(seconds);
	}, []);

	const cancelSleepTimer = useCallback(() => {
		setSleepTimer(null);
		// A cancel mid-fade has to put the level back.
		if (audioRef.current) audioRef.current.volume = volumeRef.current;
	}, []);

	const startSleepTimer = useCallback(
		(mode: SleepTimerMode) => {
			const ab = audiobookRef.current;
			const { currentTime, duration: total } = getPlaybackState();
			setSleepTimer(
				createSleepTimer(mode, {
					chapters: ab?.chapters ?? [],
					globalTime: currentTime,
					totalDuration: total,
				}),
			);
			if (audioRef.current) audioRef.current.volume = volumeRef.current;
		},
		[getPlaybackState],
	);

	const extendSleep = useCallback(() => {
		setSleepTimer((prev) => extendSleepTimer(prev));
		if (audioRef.current) audioRef.current.volume = volumeRef.current;
	}, []);

	// Paused playback holds the timer: a sleep timer measures listening, not
	// wall-clock.
	useInterval(() => {
		const audio = audioRef.current;
		if (!audio || audio.paused || !sleepTimer) return;
		const ab = audiobookRef.current;
		const { currentTime, duration: total } = getPlaybackState();
		const { state, expired } = tickSleepTimer(sleepTimer, 1, {
			chapters: ab?.chapters ?? [],
			globalTime: currentTime,
			totalDuration: total,
			speed: speedRef.current,
		});
		if (expired) {
			audio.pause();
			audio.volume = volumeRef.current;
			setSleepTimer(null);
			return;
		}
		audio.volume = volumeRef.current * sleepFadeFactor(state?.remaining ?? 0);
		setSleepTimer(state);
	}, 1000);

	const setVolume = useCallback((newVolume: number) => {
		const clamped = clampVolume(newVolume);
		setVolumeState(clamped);
		if (audioRef.current) audioRef.current.volume = clamped;
		persistVolume(clamped);
	}, []);

	const signalPlayIntent = useCallback((uuid: string | null) => {
		setLoadingUuid(uuid);
	}, []);

	const stop = useCallback(() => {
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
			audio.volume = volumeRef.current;
		}
		setIsExpanded(false);
		setSleepTimer(null);
		setUpNext(null);
		setBookEnded(false);
		upNextResolvedForRef.current = null;
		preloadedFileRef.current = null;
		preloadRef.current = null;
		pausedAtRef.current = null;
		clearMediaSession();
		mediaChapterRef.current = -1;
		pendingSeekRef.current = null;
		setAudiobook(null);
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);
		setCurrentFileIndex(0);
		setIsLoading(true);
		setLoadingUuid(null);
		setPlaybackError(false);
		bufferingRef.current?.resume();
		persistActiveBook(null);
	}, []);

	// OS transport (lock screen, media keys). Bound once; the handlers read the
	// live callbacks through refs.
	const mediaActionsRef = useRef({ seekTo, seekRelative, skipChapter, stop });
	mediaActionsRef.current = { seekTo, seekRelative, skipChapter, stop };
	useMountEffect(() =>
		registerMediaSessionHandlers({
			play: () => audioRef.current?.play().catch(() => {}),
			pause: () => audioRef.current?.pause(),
			stop: () => mediaActionsRef.current.stop(),
			seekBackward: (offset) =>
				mediaActionsRef.current.seekRelative(-(offset ?? jumpBackRef.current)),
			seekForward: (offset) =>
				mediaActionsRef.current.seekRelative(offset ?? jumpForwardRef.current),
			seekTo: (time) => mediaActionsRef.current.seekTo(time),
			previousChapter: () => mediaActionsRef.current.skipChapter(-1),
			nextChapter: () => mediaActionsRef.current.skipChapter(1),
		}),
	);

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
			activeChapterIndex,
			showError,
			showBuffering,
			loadingUuid,
			playbackError,
			jumpBack,
			jumpForward,
			sleepTimer,
			defaultSpeed,
			speedIsOverride,
			autoplayNext,
			upNext,
			bookEnded,
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
			activeChapterIndex,
			showError,
			showBuffering,
			loadingUuid,
			playbackError,
			jumpBack,
			jumpForward,
			sleepTimer,
			defaultSpeed,
			speedIsOverride,
			autoplayNext,
			upNext,
			bookEnded,
		],
	);

	const actions = useMemo<AudioPlayerActions>(
		() => ({
			loadAudiobook,
			togglePlay,
			play,
			pause,
			seekTo,
			seekRelative,
			getGlobalCurrentTime,
			setSpeed,
			setVolume,
			stop,
			signalPlayIntent,
			retry,
			skipChapter,
			setJumpBack,
			setJumpForward,
			startSleepTimer,
			extendSleep,
			cancelSleepTimer,
			setExpanded: setIsExpanded,
			useDefaultSpeed,
			setAutoplayNext,
			playNextInSeries,
			replayBook,
			dismissBookEnded,
		}),
		[
			loadAudiobook,
			togglePlay,
			play,
			pause,
			seekTo,
			seekRelative,
			getGlobalCurrentTime,
			setSpeed,
			setVolume,
			stop,
			signalPlayIntent,
			retry,
			skipChapter,
			setJumpBack,
			setJumpForward,
			startSleepTimer,
			extendSleep,
			cancelSleepTimer,
			useDefaultSpeed,
			setAutoplayNext,
			playNextInSeries,
			replayBook,
			dismissBookEnded,
		],
	);

	const nowPlayingUuid = audiobook?.uuid ?? null;
	const nowPlaying = useMemo(
		() => (nowPlayingUuid ? { uuid: nowPlayingUuid, isPlaying } : null),
		[nowPlayingUuid, isPlaying],
	);

	return (
		<AudioPlayerStateContext.Provider value={state}>
			{playbackSync}
			<AudioPlayerActionsContext.Provider value={actions}>
				<AudioPlayerBookContext.Provider value={audiobook}>
					<AudioPlayerLoadingContext.Provider value={loadingUuid}>
						<AudioPlayerExpandedContext.Provider value={isExpanded}>
							<AudioPlayerNowPlayingContext.Provider value={nowPlaying}>
								{/* biome-ignore lint/a11y/useMediaCaption: audio player for user's own audiobooks */}
								<audio ref={audioRef} preload="auto" />
								{children}
							</AudioPlayerNowPlayingContext.Provider>
						</AudioPlayerExpandedContext.Provider>
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

/** Expanded mode, without subscribing to playback ticks. */
export function useAudioPlayerExpanded(): boolean {
	return useContext(AudioPlayerExpandedContext);
}

/**
 * "playing" / "paused" when `uuid` is the loaded audiobook, else null. Never
 * re-renders on playback ticks.
 */
export function useAudiobookPlaybackStatus(
	uuid: string,
): "playing" | "paused" | null {
	const nowPlaying = useContext(AudioPlayerNowPlayingContext);
	if (nowPlaying?.uuid !== uuid) return null;
	return nowPlaying.isPlaying ? "playing" : "paused";
}
