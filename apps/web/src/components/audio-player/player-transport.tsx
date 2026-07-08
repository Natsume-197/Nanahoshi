import {
	Pause,
	Play,
	ArrowCounterClockwise,
	ArrowClockwise,
	SkipBack,
	SkipForward,
} from "@phosphor-icons/react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { getActiveChapterIndex } from "@/utils/chapters";

const SIZES = {
	sm: {
		wrap: "gap-0.5",
		btn: "size-8",
		icon: "size-4",
		play: "mx-0.5 size-9",
		playIcon: "size-5",
	},
	lg: {
		wrap: "gap-2",
		btn: "size-11",
		icon: "size-6",
		play: "mx-1 size-14",
		playIcon: "size-7",
	},
} as const;

/**
 * Transport cluster shared by the mini and expanded players: previous chapter,
 * back 10s, play/pause, forward 10s, next chapter. Chapter buttons hide when the
 * book has no chapters. Reads/writes the shared audio context.
 */
export const PlayerTransport = memo(function PlayerTransport({
	size = "sm",
}: {
	size?: "sm" | "lg";
}) {
	const { audiobook, isPlaying, globalCurrentTime } = useAudioPlayerState();
	const { togglePlay, seekTo, seekRelative } = useAudioPlayerActions();
	const s = SIZES[size];

	const chapters = audiobook?.chapters ?? [];
	const hasChapters = chapters.length > 0;

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
		<div className={cn("flex shrink-0 items-center", s.wrap)}>
			{hasChapters && (
				<Button
					variant="ghost"
					size="icon"
					aria-label="Previous chapter"
					disabled={!hasPrevChapter}
					onClick={goToPrevChapter}
					className={cn(s.btn, "text-muted-foreground")}
				>
					<SkipBack className={s.icon} />
				</Button>
			)}
			<Button
				variant="ghost"
				size="icon"
				aria-label="Back 10 seconds"
				onClick={() => seekRelative(-10)}
				className={cn(s.btn, "text-muted-foreground")}
			>
				<ArrowCounterClockwise className={s.icon} />
			</Button>
			<button
				type="button"
				aria-label={isPlaying ? "Pause" : "Play"}
				onClick={togglePlay}
				className={cn(
					"flex shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105",
					s.play,
				)}
			>
				{isPlaying ? (
					<Pause className={s.playIcon} />
				) : (
					<Play className={cn("ml-0.5", s.playIcon)} />
				)}
			</button>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Forward 10 seconds"
				onClick={() => seekRelative(10)}
				className={cn(s.btn, "text-muted-foreground")}
			>
				<ArrowClockwise className={s.icon} />
			</Button>
			{hasChapters && (
				<Button
					variant="ghost"
					size="icon"
					aria-label="Next chapter"
					disabled={!hasNextChapter}
					onClick={goToNextChapter}
					className={cn(s.btn, "text-muted-foreground")}
				>
					<SkipForward className={s.icon} />
				</Button>
			)}
		</div>
	);
});
