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
import { PlayerIconButton } from "@/components/audio-player/player-controls";
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
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

type TransportSize = "bar" | "expanded";

/** Jump arrow with its amount printed inside the arc. */
function JumpIcon({
	seconds,
	direction,
	size,
}: {
	seconds: number;
	direction: "back" | "forward";
	size: TransportSize;
}) {
	const Arrow = direction === "back" ? ArrowCounterClockwise : ArrowClockwise;
	if (size === "bar") return <Arrow className="size-4" />;
	return (
		<span className="relative flex items-center justify-center">
			<Arrow className="size-7" />
			<span aria-hidden className="absolute font-semibold text-[10px]">
				{seconds}
			</span>
		</span>
	);
}

/**
 * The play/pause control in all three of its sizes. Owns the loading, stalled
 * and error states so they can't drift between the bar and the expanded player.
 */
export const PlayPauseButton = memo(function PlayPauseButton({
	variant,
}: {
	/** `strip` is the mobile bar's plain ghost button; the others are filled. */
	variant: "strip" | "bar" | "expanded";
}) {
	const { isPlaying, isLoading, showError, showBuffering } =
		useAudioPlayerState();
	const { togglePlay, retry } = useAudioPlayerActions();

	const label = showError
		? m["audiobook.retry_playback"]()
		: isPlaying
			? m["audiobook.player_pause"]()
			: m["audiobook.player_play"]();
	const isExpanded = variant === "expanded";
	const iconClass = isExpanded ? "size-8" : "size-5";

	const icon = isLoading ? (
		<CircleNotch className={cn(iconClass, "animate-spin")} />
	) : showError ? (
		<ArrowsClockwise className={iconClass} />
	) : isPlaying ? (
		<Pause className={iconClass} weight={isExpanded ? "fill" : "regular"} />
	) : (
		<Play
			className={cn(iconClass, "ml-0.5")}
			weight={isExpanded ? "fill" : "regular"}
		/>
	);

	const control =
		variant === "strip" ? (
			<Button
				variant="ghost"
				size="icon"
				aria-label={label}
				aria-busy={isLoading || showBuffering}
				onClick={showError ? retry : togglePlay}
				className={cn("size-8", showError && "text-destructive")}
			>
				{icon}
			</Button>
		) : (
			<button
				type="button"
				aria-label={label}
				aria-busy={isLoading || showBuffering}
				onClick={showError ? retry : togglePlay}
				className={cn(
					"flex shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105 active:scale-[var(--press-scale)]",
					isExpanded ? "size-16" : "size-9",
				)}
			>
				{icon}
			</button>
		);

	return (
		<div className="relative flex shrink-0 items-center justify-center">
			{/* A stall keeps the pause icon and adds a ring around it: swapping the
			    icon out mid-playback would flicker on every short rebuffer. */}
			{showBuffering && (
				<span
					aria-hidden
					className={cn(
						"pointer-events-none absolute animate-spin rounded-full border-2 border-foreground/25 border-t-foreground",
						variant === "strip" ? "inset-0.5" : "inset-[-3px]",
					)}
				/>
			)}
			{variant === "strip" ? (
				control
			) : (
				<Tooltip>
					<TooltipTrigger asChild>{control}</TooltipTrigger>
					<TooltipContent side="top" sideOffset={8}>
						{label}
					</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
});

/**
 * Transport cluster: previous chapter, jump back, play/pause, jump forward,
 * next chapter. Chapter buttons hide when the book has no chapters.
 */
export const PlayerTransport = memo(function PlayerTransport({
	size = "bar",
}: {
	size?: TransportSize;
}) {
	const { audiobook, activeChapterIndex, jumpBack, jumpForward } =
		useAudioPlayerState();
	const { seekRelative, skipChapter } = useAudioPlayerActions();

	const chapterCount = audiobook?.chapters.length ?? 0;
	const hasNextChapter =
		activeChapterIndex >= 0 && activeChapterIndex < chapterCount - 1;

	const isExpanded = size === "expanded";
	const buttonClass = isExpanded ? "size-11" : "size-8";

	return (
		<div
			className={cn(
				"flex shrink-0 items-center",
				isExpanded ? "gap-1 sm:gap-3" : "gap-0.5",
			)}
		>
			{chapterCount > 0 && (
				<PlayerIconButton
					label={m["audiobook.player_prev_chapter"]()}
					onClick={() => skipChapter(-1)}
					className={buttonClass}
				>
					<SkipBack className={isExpanded ? "size-5" : "size-4"} />
				</PlayerIconButton>
			)}
			<PlayerIconButton
				label={m["audiobook.player_back_seconds"]({ seconds: jumpBack })}
				onClick={() => seekRelative(-jumpBack)}
				className={buttonClass}
			>
				<JumpIcon seconds={jumpBack} direction="back" size={size} />
			</PlayerIconButton>
			<div className={isExpanded ? "mx-1" : "mx-0.5"}>
				<PlayPauseButton variant={size} />
			</div>
			<PlayerIconButton
				label={m["audiobook.player_forward_seconds"]({ seconds: jumpForward })}
				onClick={() => seekRelative(jumpForward)}
				className={buttonClass}
			>
				<JumpIcon seconds={jumpForward} direction="forward" size={size} />
			</PlayerIconButton>
			{chapterCount > 0 && (
				<PlayerIconButton
					label={m["audiobook.player_next_chapter"]()}
					disabled={!hasNextChapter}
					onClick={() => skipChapter(1)}
					className={buttonClass}
				>
					<SkipForward className={isExpanded ? "size-5" : "size-4"} />
				</PlayerIconButton>
			)}
		</div>
	);
});
