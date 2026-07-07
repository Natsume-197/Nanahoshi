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
	currentFileIndex: number;
	globalCurrentTime: number;
	totalDuration: number;
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
	const [currentFileIndex, setCurrentFileIndex] = useState(0);

	// Refs that hold latest values for callbacks
	const audiobookRef = useRef<AudiobookPlayerData | null>(null);
	audiobookRef.current = audiobook;
	const currentFileIndexRef = useRef(0);
	currentFileIndexRef.current = currentFileIndex;
	const isPlayingRef = useRef(false);
	isPlayingRef.current = isPlaying;

	// Precomputed file offsets and total duration for multi-file audiobooks
	const fileOffsetsRef = useRef<number[]>([]);
	const totalDurationRef = useRef(0);

	// Position (within the active file) to seek to once the media can accept it.
	// Setting currentTime before metadata loads only records a "default start
	// position" that the browser applies on play — so a paused restore would stay
	// at 0. We stash it here and apply it on loadedmetadata instead.
	const pendingSeekRef = useRef<number | null>(null);

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
			const handleCanPlay = () => {
				setIsLoading(false);
				if (audio.duration && Number.isFinite(audio.duration)) {
					setDuration(audio.duration);
				}
			};
			const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
			// Apply a position restored from saved progress once the media is ready
			// to accept the seek (covers the paused restore-after-reload case, where
			// no play() would otherwise flush the pending position).
			const handleLoadedMetadata = () => {
				if (pendingSeekRef.current == null) return;
				const target = pendingSeekRef.current;
				pendingSeekRef.current = null;
				audio.currentTime = target;
				setCurrentTime(audio.currentTime);
			};
			const handlePlay = () => setIsPlaying(true);
			const handlePause = () => setIsPlaying(false);
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
			audio.addEventListener("loadedmetadata", handleLoadedMetadata);
			audio.addEventListener("timeupdate", handleTimeUpdate);
			audio.addEventListener("play", handlePlay);
			audio.addEventListener("pause", handlePause);
			audio.addEventListener("ended", handleEnded);

			return () => {
				audio.removeEventListener("canplay", handleCanPlay);
				audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
				audio.removeEventListener("timeupdate", handleTimeUpdate);
				audio.removeEventListener("play", handlePlay);
				audio.removeEventListener("pause", handlePause);
				audio.removeEventListener("ended", handleEnded);
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

	const loadAudiobook = useCallback(
		(
			ab: AudiobookPlayerData,
			options?: { autoplay?: boolean; startTime?: number },
		) => {
			const autoplay = options?.autoplay ?? true;
			const audio = audioRef.current;
			if (!audio) return;

			if (audiobookRef.current?.uuid === ab.uuid) return;

			persistActiveBook(ab.uuid);
			setIsLoading(true);
			setIsPlaying(false);
			setCurrentTime(0);
			setCurrentFileIndex(0);
			setSpeedState(1);
			audio.playbackRate = 1;
			hasMarkedListeningRef.current = false;

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
						if (
							progress?.currentTimeSeconds &&
							progress.currentTimeSeconds > 0
						) {
							applyStartPosition(progress.currentTimeSeconds);
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
		[computeFileOffsets, getStreamUrl, router],
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

			const single = ab.audioFiles.length <= 1;

			if (single) {
				audio.currentTime = Math.max(0, Math.min(time, duration));
			} else {
				const clamped = Math.max(0, Math.min(time, totalDurationRef.current));
				const offsets = fileOffsetsRef.current;
				// Find the file that contains this time using precomputed offsets
				let fileIdx = 0;
				for (let i = offsets.length - 1; i >= 0; i--) {
					if (clamped >= offsets[i]) {
						fileIdx = i;
						break;
					}
				}
				const fileTime = clamped - (offsets[fileIdx] ?? 0);
				if (fileIdx !== currentFileIndexRef.current) {
					setCurrentFileIndex(fileIdx);
					audio.src = getStreamUrl(ab.uuid, fileIdx);
				}
				audio.currentTime = fileTime;
				if (isPlayingRef.current) audio.play();
			}
		},
		[duration, getStreamUrl],
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
			currentFileIndex,
			globalCurrentTime,
			totalDuration,
		}),
		[
			audiobook,
			isPlaying,
			currentTime,
			duration,
			speed,
			volume,
			isLoading,
			currentFileIndex,
			globalCurrentTime,
			totalDuration,
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
		],
	);

	return (
		<AudioPlayerStateContext.Provider value={state}>
			<AudioPlayerActionsContext.Provider value={actions}>
				<AudioPlayerBookContext.Provider value={audiobook}>
					{/* biome-ignore lint/a11y/useMediaCaption: audio player for user's own audiobooks */}
					<audio ref={audioRef} preload="auto" />
					{children}
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
