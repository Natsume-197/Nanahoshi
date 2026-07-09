import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { memo, useRef, useState } from "react";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import {
	getActiveChapterIndex,
	getChapterMarkerPercents,
} from "@/utils/chapters";
import { formatTime } from "@/utils/format";

/**
 * Scrubber shared by the mini and expanded players: current/total time on each
 * end, chapter markers on the track, and a hover tooltip showing the time and
 * chapter under the cursor. Reads/writes the shared audio context.
 */
export const PlayerSeekBar = memo(function PlayerSeekBar({
	className,
}: {
	className?: string;
}) {
	const { audiobook, globalCurrentTime, totalDuration } = useAudioPlayerState();
	const { seekTo } = useAudioPlayerActions();

	const [isDragging, setIsDragging] = useState(false);
	const [dragValue, setDragValue] = useState(0);
	// Fraction (0–1) of the bar the cursor is over, or null when not hovering.
	const [hoverPct, setHoverPct] = useState<number | null>(null);
	const commitRef = useRef(seekTo);
	commitRef.current = seekTo;

	const chapters = audiobook?.chapters ?? [];
	const displayTime = isDragging ? dragValue : globalCurrentTime;

	// Chapters use global time, matching globalCurrentTime / totalDuration.
	const chapterMarkers = getChapterMarkerPercents(chapters, totalDuration);

	const hoverTime = hoverPct != null ? hoverPct * totalDuration : null;
	const hoverIndex =
		hoverTime != null ? getActiveChapterIndex(chapters, hoverTime) : -1;
	const hoverChapter =
		hoverIndex >= 0
			? { chapter: chapters[hoverIndex], index: hoverIndex }
			: null;

	const handleSeekHover = (e: React.PointerEvent<HTMLElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		if (rect.width === 0) return;
		const pct = (e.clientX - rect.left) / rect.width;
		setHoverPct(Math.min(1, Math.max(0, pct)));
	};

	return (
		<div className={cn("flex w-full items-center gap-2.5", className)}>
			<span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
				{formatTime(displayTime)}
			</span>
			<div className="relative flex min-w-0 flex-1 items-center">
				{hoverPct != null && hoverTime != null && (
					<div
						className="pointer-events-none absolute bottom-full z-10 mb-2 flex max-w-56 -translate-x-1/2 flex-col items-center gap-0.5 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-center text-popover-foreground text-xs shadow-md"
						style={{
							left: `clamp(3rem, ${hoverPct * 100}%, calc(100% - 3rem))`,
						}}
					>
						<span className="font-medium tabular-nums">
							{formatTime(hoverTime)}
						</span>
						{hoverChapter?.chapter && (
							<span className="max-w-52 truncate text-muted-foreground">
								{hoverChapter.index + 1}.{" "}
								{hoverChapter.chapter.title ??
									`Chapter ${hoverChapter.index + 1}`}
							</span>
						)}
					</div>
				)}
				<SliderPrimitive.Root
					min={0}
					max={Math.max(totalDuration, 1)}
					step={1}
					value={[displayTime]}
					onValueChange={([val]) => {
						setIsDragging(true);
						setDragValue(val ?? 0);
					}}
					onValueCommitted={([val]) => {
						setIsDragging(false);
						commitRef.current(val ?? 0);
					}}
					onPointerMove={handleSeekHover}
					onPointerEnter={handleSeekHover}
					onPointerLeave={() => setHoverPct(null)}
					aria-label="Seek"
					className="group relative flex min-w-0 flex-1 cursor-pointer touch-none select-none items-center py-1.5"
				>
					<SliderPrimitive.Control className="relative flex min-w-0 flex-1 items-center">
						<SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-foreground/20 transition-[height] group-hover:h-1.5">
							<SliderPrimitive.Indicator className="absolute h-full rounded-full bg-foreground" />
							{chapterMarkers.map((pct) => (
								<span
									key={pct}
									className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-background"
									style={{ left: `${pct}%` }}
								/>
							))}
						</SliderPrimitive.Track>
						<SliderPrimitive.Thumb
							index={0}
							className="block size-0 rounded-full bg-foreground transition-[width,height] focus-visible:size-4 focus-visible:outline-hidden group-hover:size-4"
						/>
					</SliderPrimitive.Control>
				</SliderPrimitive.Root>
			</div>
			<span className="w-10 shrink-0 text-[11px] text-muted-foreground tabular-nums">
				{formatTime(totalDuration)}
			</span>
		</div>
	);
});
