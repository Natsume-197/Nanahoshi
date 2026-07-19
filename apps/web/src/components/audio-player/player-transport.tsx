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
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { m } from "@/paraglide/messages";
import { getActiveChapterIndex } from "@/utils/chapters";

/** Icon button with a top tooltip; the label doubles as the accessible name. */
function TransportButton({
	label,
	onClick,
	disabled,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
					className="size-8 text-muted-foreground"
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

/**
 * Compact transport cluster: previous chapter, back 10s, play/pause, forward
 * 10s, next chapter. Chapter buttons hide when the book has no chapters.
 */
export const PlayerTransport = memo(function PlayerTransport() {
	const {
		audiobook,
		isPlaying,
		isLoading,
		isBuffering,
		playbackError,
		globalCurrentTime,
	} = useAudioPlayerState();
	const { togglePlay, seekTo, seekRelative, retry } = useAudioPlayerActions();

	const chapters = audiobook?.chapters ?? [];
	const hasChapters = chapters.length > 0;
	// After a stream failure the central control becomes a retry (unless a retry
	// is already in flight, when the spinner takes over).
	const showError = playbackError && !isLoading;
	// The book-load spinner and the error state already own the button.
	const showBuffering = isBuffering && !isLoading && !showError;

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

	const centerLabel = showError
		? m["audiobook.retry_playback"]()
		: isPlaying
			? m["audiobook.player_pause"]()
			: m["audiobook.player_play"]();

	return (
		<div className="flex shrink-0 items-center gap-0.5">
			{hasChapters && (
				<TransportButton
					label={m["audiobook.player_prev_chapter"]()}
					disabled={!hasPrevChapter}
					onClick={goToPrevChapter}
				>
					<SkipBack className="size-4" />
				</TransportButton>
			)}
			<TransportButton
				label={m["audiobook.player_back_10"]()}
				onClick={() => seekRelative(-10)}
			>
				<ArrowCounterClockwise className="size-4" />
			</TransportButton>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="relative mx-0.5 flex shrink-0 items-center justify-center">
						{/* A stall keeps the pause icon and adds a ring around it: swapping
						    the icon out mid-playback would flicker on every short rebuffer. */}
						{showBuffering && (
							<span
								aria-hidden
								className="pointer-events-none absolute inset-[-3px] animate-spin rounded-full border-2 border-foreground/25 border-t-foreground"
							/>
						)}
						<button
							type="button"
							aria-label={centerLabel}
							aria-busy={isLoading || showBuffering}
							onClick={showError ? retry : togglePlay}
							className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
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
					</div>
				</TooltipTrigger>
				<TooltipContent side="top" sideOffset={8}>
					{centerLabel}
				</TooltipContent>
			</Tooltip>
			<TransportButton
				label={m["audiobook.player_forward_10"]()}
				onClick={() => seekRelative(10)}
			>
				<ArrowClockwise className="size-4" />
			</TransportButton>
			{hasChapters && (
				<TransportButton
					label={m["audiobook.player_next_chapter"]()}
					disabled={!hasNextChapter}
					onClick={goToNextChapter}
				>
					<SkipForward className="size-4" />
				</TransportButton>
			)}
		</div>
	);
});
