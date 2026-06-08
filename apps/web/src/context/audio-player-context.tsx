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
import { client } from "@/utils/orpc";

export interface AudiobookPlayerData {
	uuid: string;
	title: string | null;
	filename: string;
	cover: string | null;
	mainColor: string | null;
	duration: number | null;
	authors: { id: number; name: string }[];
	narrators: { id: number; name: string }[];
	chapters: {
		index: number;
		title: string;
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
	isLoading: boolean;
	currentFileIndex: number;
	globalCurrentTime: number;
	totalDuration: number;
}

interface AudioPlayerActions {
	loadAudiobook: (audiobook: AudiobookPlayerData) => void;
	togglePlay: () => void;
	seekTo: (time: number) => void;
	seekRelative: (seconds: number) => void;
	setSpeed: (speed: number) => void;
	stop: () => void;
	pause: () => void;
}

const AudioPlayerStateContext = createContext<AudioPlayerState | null>(null);
const AudioPlayerActionsContext = createContext<AudioPlayerActions | null>(
	null,
);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
	const router = useRouter();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const hasMarkedListeningRef = useRef(false);

	const [audiobook, setAudiobook] = useState<AudiobookPlayerData | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [speed, setSpeedState] = useState(1);
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
			audio.addEventListener("timeupdate", handleTimeUpdate);
			audio.addEventListener("play", handlePlay);
			audio.addEventListener("pause", handlePause);
			audio.addEventListener("ended", handleEnded);

			return () => {
				audio.removeEventListener("canplay", handleCanPlay);
				audio.removeEventListener("timeupdate", handleTimeUpdate);
				audio.removeEventListener("play", handlePlay);
				audio.removeEventListener("pause", handlePause);
				audio.removeEventListener("ended", handleEnded);
			};
		},
		[getStreamUrl],
	);

	// Mount audio element and attach listeners
	useMountEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;
		return attachAudioListeners(audio);
	});

	const loadAudiobook = useCallback(
		(ab: AudiobookPlayerData) => {
			const audio = audioRef.current;
			if (!audio) return;

			// If same audiobook is already loaded, don't reload
			if (audiobookRef.current?.uuid === ab.uuid) return;

			// Reset state
			setIsLoading(true);
			setIsPlaying(false);
			setCurrentTime(0);
			setCurrentFileIndex(0);
			setSpeedState(1);
			audio.playbackRate = 1;
			hasMarkedListeningRef.current = false;

			// Compute file offsets
			computeFileOffsets(ab.audioFiles);

			const single = ab.audioFiles.length <= 1;
			const totalDur = single
				? (ab.duration ?? 0)
				: ab.audioFiles.reduce((sum, f) => sum + f.duration, 0);
			setDuration(totalDur);

			// Set audiobook data
			setAudiobook(ab);

			// Load first audio file
			audio.src = getStreamUrl(ab.uuid, 0);

			// Restore position from progress
			client.listeningProgress
				.getProgress({ bookUuid: ab.uuid })
				.then((progress) => {
					if (progress?.currentTimeSeconds && progress.currentTimeSeconds > 0) {
						if (single) {
							audio.currentTime = progress.currentTimeSeconds;
						} else {
							let remaining = progress.currentTimeSeconds;
							for (let i = 0; i < ab.audioFiles.length; i++) {
								if (remaining <= ab.audioFiles[i].duration) {
									if (i !== 0) {
										setCurrentFileIndex(i);
										audio.src = getStreamUrl(ab.uuid, i);
									}
									audio.currentTime = remaining;
									break;
								}
								remaining -= ab.audioFiles[i].duration;
							}
						}
						setCurrentTime(audio.currentTime);
					}
				})
				.catch(() => {})
				.then(() => {
					audio.play().catch(() => {});
				});

			// Mark as listening
			if (!hasMarkedListeningRef.current) {
				hasMarkedListeningRef.current = true;
				client.listeningProgress
					.saveProgress({
						bookUuid: ab.uuid,
						status: "listening",
					})
					.then(() => router.invalidate())
					.catch(() => {});
			}
		},
		[computeFileOffsets, getStreamUrl, router],
	);

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
	}, []);

	const state = useMemo<AudioPlayerState>(
		() => ({
			audiobook,
			isPlaying,
			currentTime,
			duration,
			speed,
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
			stop,
			pause,
		}),
		[loadAudiobook, togglePlay, seekTo, seekRelative, setSpeed, stop, pause],
	);

	return (
		<AudioPlayerStateContext.Provider value={state}>
			<AudioPlayerActionsContext.Provider value={actions}>
				{/* biome-ignore lint/a11y/useMediaCaption: audio player for user's own audiobooks */}
				<audio ref={audioRef} preload="auto" />
				{children}
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
