import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { memo, useMemo, useState } from "react";
import {
	getProgressReadout,
	type ProgressScope,
} from "@/components/audio-player/chapter-progress";
import { hoverFraction } from "@/components/audio-player/seek-plan";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import {
	formatChapterLabel,
	getActiveChapterIndex,
	getChapterMarkerPercents,
} from "@/utils/chapters";
import { formatTime } from "@/utils/format";

/** Chapter starts on the track. Static between chapter edits. */
const ChapterMarkers = memo(function ChapterMarkers({
	chapters,
	totalDuration,
}: {
	chapters: { startTime: number }[];
	totalDuration: number;
}) {
	const markers = useMemo(
		() => getChapterMarkerPercents(chapters, totalDuration),
		[chapters, totalDuration],
	);
	return (
		<>
			{markers.map((pct) => (
				<span
					key={pct}
					className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-background"
					style={{ left: `${pct}%` }}
				/>
			))}
		</>
	);
});

/**
 * Player scrubber: current/total time on each end, chapter markers on the
 * track, and a hover tooltip + YouTube-style hover fill showing the time and
 * chapter under the cursor. In `chapter` scope the track and labels narrow to
 * the chapter the caller passes in.
 */
export const PlayerSeekBar = memo(function PlayerSeekBar({
	className,
	size = "sm",
	scope = "book",
	chapter,
}: {
	className?: string;
	size?: "sm" | "lg";
	scope?: ProgressScope;
	chapter?: { startTime: number; endTime: number };
}) {
	const { audiobook, globalCurrentTime, totalDuration } = useAudioPlayerState();
	const { seekTo } = useAudioPlayerActions();

	const [isDragging, setIsDragging] = useState(false);
	const [dragValue, setDragValue] = useState(0);
	// Fraction (0–1) of the bar the cursor is over, or null when not hovering.
	const [hoverPct, setHoverPct] = useState<number | null>(null);

	const chapters = audiobook?.chapters ?? [];
	const displayTime = isDragging ? dragValue : globalCurrentTime;

	// The slider always works in absolute seconds; only its window narrows.
	const { start, end, elapsed, remaining } = getProgressReadout(scope, {
		globalTime: displayTime,
		totalDuration: Math.max(totalDuration, 1),
		chapter,
	});
	const trackLength = Math.max(end - start, 1);
	const isChapterScope = scope === "chapter" && chapter != null;

	const hoverTime = hoverPct != null ? start + hoverPct * trackLength : null;
	const hoverIndex =
		hoverTime != null ? getActiveChapterIndex(chapters, hoverTime) : -1;

	const handleSeekHover = (e: React.PointerEvent<HTMLElement>) => {
		const pct = hoverFraction(
			e.clientX,
			e.currentTarget.getBoundingClientRect(),
		);
		if (pct != null) setHoverPct(pct);
	};

	const isLarge = size === "lg";
	const labelClass = cn(
		"shrink-0 tabular-nums",
		isLarge
			? "w-12 text-foreground/70 text-xs"
			: "w-10 text-[11px] text-muted-foreground",
	);
	// The bar keeps the book's total as a fixed reference; the expanded player
	// counts down, which is what a listener deciding to keep going reads.
	const rightLabel = isLarge
		? `-${formatTime(remaining)}`
		: formatTime(totalDuration);

	return (
		<div className={cn("flex w-full items-center gap-2.5", className)}>
			<span className={cn(labelClass, "text-right")}>
				{formatTime(elapsed)}
			</span>
			<div className="relative flex min-w-0 flex-1 items-center">
				{hoverPct != null && hoverTime != null && (
					<div
						className="pointer-events-none absolute bottom-full z-10 mb-2 flex w-max max-w-72 -translate-x-1/2 flex-col items-center gap-0.5 rounded-md border border-border bg-popover px-2 py-1 text-center text-popover-foreground text-xs shadow-md"
						style={{
							left: `clamp(3rem, ${hoverPct * 100}%, calc(100% - 3rem))`,
						}}
					>
						<span className="font-medium tabular-nums">
							{formatTime(isChapterScope ? hoverTime - start : hoverTime)}
						</span>
						{hoverIndex >= 0 && (
							// Full chapter name — wraps instead of truncating so long titles
							// stay readable; max-width keeps the bubble from spanning the bar.
							<span className="whitespace-normal break-words text-muted-foreground">
								{formatChapterLabel(chapters[hoverIndex], hoverIndex)}
							</span>
						)}
					</div>
				)}
				<SliderPrimitive.Root
					min={start}
					max={end}
					step={1}
					// Scalar value: Base UI's pointer path passes a number (not an
					// array) to these callbacks when there's a single thumb.
					value={Math.max(start, Math.min(end, displayTime))}
					onValueChange={(val) => {
						setIsDragging(true);
						setDragValue(val);
					}}
					onValueCommitted={(val) => {
						setIsDragging(false);
						seekTo(val);
					}}
					onPointerMove={handleSeekHover}
					onPointerEnter={handleSeekHover}
					onPointerLeave={() => setHoverPct(null)}
					aria-label="Seek"
					className="group relative flex min-w-0 flex-1 cursor-pointer touch-none select-none items-center"
				>
					{/* The padding lives on the Control, not the Root: only the Control
					    takes pointer events, so padding above it would show a pointer
					    cursor over a strip that swallows the click. Vertical padding
					    doesn't shift the value — that math uses inline padding only. */}
					<SliderPrimitive.Control
						className={cn(
							"relative flex min-w-0 flex-1 items-center",
							isLarge ? "py-3" : "py-2",
						)}
					>
						<SliderPrimitive.Track
							className={cn(
								"relative w-full grow overflow-hidden rounded-full bg-foreground/20 transition-[height]",
								isLarge ? "h-1.5 group-hover:h-2" : "h-1 group-hover:h-1.5",
							)}
						>
							{hoverPct != null && (
								<span
									className="pointer-events-none absolute h-full rounded-full bg-foreground/35"
									style={{ width: `${hoverPct * 100}%` }}
								/>
							)}
							<SliderPrimitive.Indicator className="absolute h-full rounded-full bg-foreground" />
							{!isChapterScope && (
								<ChapterMarkers
									chapters={chapters}
									totalDuration={totalDuration}
								/>
							)}
						</SliderPrimitive.Track>
						{/* pointer-events-none: a press landing on the thumb would otherwise
						    be a grab, not a jump, leaving a dead zone the width of the thumb
						    around the current position. Dragging still works — it runs off
						    the control's pointer capture, not the thumb. */}
						<SliderPrimitive.Thumb
							index={0}
							className={cn(
								"pointer-events-none block size-0 rounded-full bg-foreground transition-[width,height] focus-visible:outline-hidden",
								isLarge
									? "focus-visible:size-5 group-hover:size-5"
									: "focus-visible:size-4 group-hover:size-4",
							)}
						/>
					</SliderPrimitive.Control>
				</SliderPrimitive.Root>
			</div>
			<span className={labelClass}>{rightLabel}</span>
		</div>
	);
});
