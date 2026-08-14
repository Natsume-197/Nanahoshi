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
			<Arrow className="size-8" />
			<span aria-hidden className="absolute font-semibold text-[11px]">
				{seconds}
			</span>
		</span>
	);
}

/** Jump back on its own, for the mobile bar's two slots beside the artwork. */
export const JumpBackButton = memo(function JumpBackButton({
	className,
}: {
	className?: string;
}) {
	const { jumpBack } = useAudioPlayerState();
	const { seekRelative } = useAudioPlayerActions();

	return (
		<PlayerIconButton
			label={m["audiobook.player_back_seconds"]({ seconds: jumpBack })}
			onClick={() => seekRelative(-jumpBack)}
			className={cn("size-8 text-foreground", className)}
		>
			<span className="relative flex items-center justify-center">
				<ArrowCounterClockwise className="size-5" />
				<span aria-hidden className="absolute font-semibold text-[8px]">
					{jumpBack}
				</span>
			</span>
		</PlayerIconButton>
	);
});

/** Play/pause in all three sizes, owning the loading, stalled and error states. */
export const PlayPauseButton = memo(function PlayPauseButton({
	variant,
	className,
}: {
	/** `strip` is the mobile bar's plain ghost button; the others are filled. */
	variant: "strip" | "bar" | "expanded";
	className?: string;
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
	const iconClass = isExpanded ? "size-8 md:size-9" : "size-5";

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
				className={cn("size-8", showError && "text-destructive", className)}
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
					// Not the shared Button, so it carries the focus ring itself; the
					// offset keeps the ring off its own white fill.
					"flex shrink-0 items-center justify-center rounded-full bg-foreground text-background outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[var(--press-scale)]",
					isExpanded ? "size-16 md:size-[4.5rem]" : "size-9",
				)}
			>
				{icon}
			</button>
		);

	return (
		<div className="relative flex shrink-0 items-center justify-center">
			{/* A ring, not an icon swap: that would flicker on every short rebuffer. */}
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

/** Transport cluster; chapter buttons can stay visible for fixed reader layouts. */
export const PlayerTransport = memo(function PlayerTransport({
	size = "bar",
	alwaysShowChapterControls = false,
}: {
	size?: TransportSize;
	alwaysShowChapterControls?: boolean;
}) {
	const { audiobook, activeChapterIndex, jumpBack, jumpForward } =
		useAudioPlayerState();
	const { seekRelative, skipChapter } = useAudioPlayerActions();

	const chapterCount = audiobook?.chapters.length ?? 0;
	const showChapterControls = alwaysShowChapterControls || chapterCount > 0;
	const hasNextChapter =
		activeChapterIndex >= 0 && activeChapterIndex < chapterCount - 1;

	const isExpanded = size === "expanded";
	const buttonClass = cn(
		"shrink-0",
		isExpanded ? "size-12 text-foreground" : "size-8",
	);
	// Elastic gap, so the row always spans the column exactly. The cap only bites
	// without chapters, where three controls alone would sprawl.
	const gap = isExpanded ? (
		<span aria-hidden className="max-w-22 flex-1" />
	) : null;

	return (
		<div
			className={cn(
				"flex shrink-0 items-center",
				isExpanded ? "w-full justify-center" : "gap-0.5",
			)}
		>
			{showChapterControls && (
				<>
					<PlayerIconButton
						label={m["audiobook.player_prev_chapter"]()}
						disabled={chapterCount === 0}
						onClick={() => skipChapter(-1)}
						className={buttonClass}
					>
						<SkipBack className={isExpanded ? "size-6" : "size-4"} />
					</PlayerIconButton>
					{gap}
				</>
			)}
			<PlayerIconButton
				label={m["audiobook.player_back_seconds"]({ seconds: jumpBack })}
				onClick={() => seekRelative(-jumpBack)}
				className={buttonClass}
			>
				<JumpIcon seconds={jumpBack} direction="back" size={size} />
			</PlayerIconButton>
			{gap}
			<div className={isExpanded ? undefined : "mx-0.5"}>
				<PlayPauseButton variant={size} />
			</div>
			{gap}
			<PlayerIconButton
				label={m["audiobook.player_forward_seconds"]({ seconds: jumpForward })}
				onClick={() => seekRelative(jumpForward)}
				className={buttonClass}
			>
				<JumpIcon seconds={jumpForward} direction="forward" size={size} />
			</PlayerIconButton>
			{showChapterControls && (
				<>
					{gap}
					<PlayerIconButton
						label={m["audiobook.player_next_chapter"]()}
						disabled={!hasNextChapter}
						onClick={() => skipChapter(1)}
						className={buttonClass}
					>
						<SkipForward className={isExpanded ? "size-6" : "size-4"} />
					</PlayerIconButton>
				</>
			)}
		</div>
	);
});
