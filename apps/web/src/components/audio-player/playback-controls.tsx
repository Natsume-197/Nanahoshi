import {
	Pause,
	Play,
	RotateCcw,
	RotateCw,
	SkipBack,
	SkipForward,
} from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlaybackControlsProps {
	isPlaying: boolean;
	onTogglePlay: () => void;
	onSeekRelative: (seconds: number) => void;
	onPrevChapter: () => void;
	onNextChapter: () => void;
	hasPrevChapter: boolean;
	hasNextChapter: boolean;
	variant?: "default" | "player";
}

export const PlaybackControls = memo(function PlaybackControls({
	isPlaying,
	onTogglePlay,
	onSeekRelative,
	onPrevChapter,
	onNextChapter,
	hasPrevChapter,
	hasNextChapter,
	variant = "default",
}: PlaybackControlsProps) {
	const isPlayer = variant === "player";

	return (
		<div className="flex items-center justify-center gap-3">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Previous chapter"
				disabled={!hasPrevChapter}
				onClick={onPrevChapter}
				className={cn(
					"size-10",
					isPlayer
						? "text-white/70 hover:bg-transparent hover:text-white disabled:text-white/20"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<SkipBack className="size-5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Rewind 30 seconds"
				onClick={() => onSeekRelative(-30)}
				className={cn(
					"size-10",
					isPlayer
						? "text-white/70 hover:bg-transparent hover:text-white"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<RotateCcw className="size-5" />
			</Button>
			<Button
				variant={isPlayer ? "ghost" : "default"}
				size="icon"
				aria-label={isPlaying ? "Pause" : "Play"}
				onClick={onTogglePlay}
				className={cn(
					"rounded-full",
					isPlayer
						? "size-16 bg-white text-black hover:scale-105 hover:bg-white/90"
						: "size-14",
				)}
			>
				{isPlaying ? (
					<Pause className={cn(isPlayer ? "size-7" : "size-6")} />
				) : (
					<Play className={cn("ml-0.5", isPlayer ? "size-7" : "size-6")} />
				)}
			</Button>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Forward 30 seconds"
				onClick={() => onSeekRelative(30)}
				className={cn(
					"size-10",
					isPlayer
						? "text-white/70 hover:bg-transparent hover:text-white"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<RotateCw className="size-5" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				aria-label="Next chapter"
				disabled={!hasNextChapter}
				onClick={onNextChapter}
				className={cn(
					"size-10",
					isPlayer
						? "text-white/70 hover:bg-transparent hover:text-white disabled:text-white/20"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<SkipForward className="size-5" />
			</Button>
		</div>
	);
});
