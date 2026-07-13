import {
	ArrowClockwise,
	ArrowCounterClockwise,
	ArrowsClockwise,
	CircleNotch,
	Pause,
	Play,
	SkipBack,
	SkipForward,
} from "@phosphor-icons/react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { getActiveChapterIndex } from "@/utils/chapters";

/**
 * Compact transport cluster: previous chapter, back 10s, play/pause, forward
 * 10s, next chapter. Chapter buttons hide when the book has no chapters.
 */
export const PlayerTransport = memo(function PlayerTransport() {
	const { audiobook, isPlaying, isLoading, playbackError, globalCurrentTime } =
		useAudioPlayerState();
	const { togglePlay, seekTo, seekRelative, retry } = useAudioPlayerActions();

	const chapters = audiobook?.chapters ?? [];
	const hasChapters = chapters.length > 0;
	// After a stream failure the central control becomes a retry (unless a retry
	// is already in flight, when the spinner takes over).
	const showError = playbackError && !isLoading;

	const activeChapterIndex = getActiveChapterIndex(chapters, globalCurrentTime);
	const hasPrevChapter = activeChapterIndex > 0;
	const hasNextChapter =
		activeChapterIndex >= 0 && activeChapterIndex < chapters.length - 1;

	const goToPrevChapter = () => {
		if (hasPrevChapter)
			seekTo(chapters[activeChapterIndex - 1]?.startTime ?? 0);
		else if (hasChapters) seekTo(chapters[0]?.startTime ?? 0);
	};
	const goToNextChapter = () => {
		if (hasNextChapter)
			seekTo(chapters[activeChapterIndex + 1]?.startTime ?? 0);
	};

	return (
		<div className="flex shrink-0 items-center gap-0.5">
			{hasChapters && (
				<Button
					variant="ghost"
					size="icon"
					aria-label="Previous chapter"
					disabled={!hasPrevChapter}
					onClick={goToPrevChapter}
					className="size-8 text-muted-foreground"
				>
					<SkipBack className="size-4" />
				</Button>
			)}
			<Button
				variant="ghost"
				size="icon"
				aria-label="Back 10 seconds"
				onClick={() => seekRelative(-10)}
				className="size-8 text-muted-foreground"
			>
				<ArrowCounterClockwise className="size-4" />
			</Button>
			<button
				type="button"
				aria-label={showError ? "Retry" : isPlaying ? "Pause" : "Play"}
				aria-busy={isLoading}
				onClick={showError ? retry : togglePlay}
				className="mx-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
			>
				{isLoading ? (
					<CircleNotch className="size-5 animate-spin" />
				) : showError ? (
					<ArrowsClockwise className="size-5" />
				) : isPlaying ? (
					<Pause className="size-5" />
				) : (
					<Play className="ml-0.5 size-5" />
				)}
			</button>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Forward 10 seconds"
				onClick={() => seekRelative(10)}
				className="size-8 text-muted-foreground"
			>
				<ArrowClockwise className="size-4" />
			</Button>
			{hasChapters && (
				<Button
					variant="ghost"
					size="icon"
					aria-label="Next chapter"
					disabled={!hasNextChapter}
					onClick={goToNextChapter}
					className="size-8 text-muted-foreground"
				>
					<SkipForward className="size-4" />
				</Button>
			)}
		</div>
	);
});
