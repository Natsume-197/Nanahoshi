import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { BookmarkSimple } from "@phosphor-icons/react";
import { memo, useMemo, useState } from "react";
import {
	findBookmarkNear,
	useBookmarks,
} from "@/components/audio-player/bookmarks";
import {
	getProgressReadout,
	type ProgressScope,
} from "@/components/audio-player/chapter-progress";
import {
	hoverFraction,
	pointerSeekTime,
} from "@/components/audio-player/seek-plan";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	formatChapterLabel,
	getActiveChapterIndex,
	getChapterMarkerPercents,
} from "@/utils/chapters";
import { formatTime } from "@/utils/format";

/**
 * Bookmark positions as vertical ticks deliberately taller than the track
 * (12px vs 4px), centered on it. They live on the Control — not inside the
 * track, whose overflow-hidden would clip them. Solid foreground: the middle
 * merges with the played fill, but the ends sticking out always contrast
 * with the panel background, so the tick reads on both sides of the
 * playhead. Subscribed to the bookmark store, so they appear/disappear in
 * the same tick the bookmark changes (a memo keyed on uuid alone would
 * stay stale).
 */
const BookmarkMarkers = memo(function BookmarkMarkers({
	uuid,
	totalDuration,
}: {
	uuid: string | null;
	totalDuration: number;
}) {
	const bookmarks = useBookmarks(uuid);
	if (totalDuration <= 0) return null;
	return (
		<>
			{bookmarks.map((bookmark) => (
				<span
					key={bookmark.id}
					className="pointer-events-none absolute top-1/2 h-3 w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
					style={{
						left: `${Math.min(100, Math.max(0, (bookmark.time / totalDuration) * 100))}%`,
					}}
				/>
			))}
		</>
	);
});

/** Hover claims a bookmark within this fraction of the book duration. */
const BOOKMARK_HOVER_FRACTION = 0.01;

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
 * Player scrubber. In `chapter` scope the track and labels narrow to the
 * chapter the caller passes in; the slider still works in absolute seconds.
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

	const { start, end, elapsed, remaining, total } = getProgressReadout(scope, {
		globalTime: displayTime,
		totalDuration: Math.max(totalDuration, 1),
		chapter,
	});
	const trackLength = Math.max(end - start, 1);
	const isChapterScope = scope === "chapter" && chapter != null;

	const hoverTime = hoverPct != null ? start + hoverPct * trackLength : null;
	const hoverIndex =
		hoverTime != null ? getActiveChapterIndex(chapters, hoverTime) : -1;
	// Bookmark title on hover, by proximity (a 2px tick is unhittable, so the
	// tooltip claims the bookmark when the cursor is within ~1% of the book).
	// Book scope only: the chapter-scoped bar narrows to one chapter.
	const bookmarks = useBookmarks(audiobook?.uuid ?? null);
	const nearBookmark =
		!isChapterScope && hoverTime != null
			? findBookmarkNear(
					bookmarks,
					hoverTime,
					Math.max(3, totalDuration * BOOKMARK_HOVER_FRACTION),
				)
			: null;
	const nearBookmarkIndex = nearBookmark
		? bookmarks.findIndex((b) => b.id === nearBookmark.id)
		: -1;

	const handleSeekHover = (e: React.PointerEvent<HTMLElement>) => {
		const pct = hoverFraction(
			e.clientX,
			e.currentTarget.getBoundingClientRect(),
		);
		if (pct != null) setHoverPct(pct);
	};
	const handleSeekStart = (e: React.PointerEvent<HTMLElement>) => {
		const target = pointerSeekTime({
			clientX: e.clientX,
			rect: e.currentTarget.getBoundingClientRect(),
			start,
			end,
		});
		if (target != null) seekTo(target);
	};

	const isLarge = size === "lg";
	const labelClass =
		"w-10 shrink-0 text-[11px] text-muted-foreground tabular-nums";
	// The bar shows the total; the expanded player counts down.
	const rightLabel = isLarge ? `-${formatTime(remaining)}` : formatTime(total);

	const track = (
		// flex-1 only in the inline layout: in the stacked one the parent's main
		// axis is vertical, and a zero flex-basis would collapse the bar's height.
		<div
			className={cn(
				"relative flex items-center",
				isLarge ? "w-full" : "min-w-0 flex-1",
			)}
		>
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
					{nearBookmark?.label ? (
						<span className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words text-foreground">
							<BookmarkSimple
								aria-hidden="true"
								className="size-3 shrink-0"
								weight="fill"
							/>
							<span className="min-w-0 tabular-nums">
								{nearBookmarkIndex + 1} · {nearBookmark.label}
							</span>
						</span>
					) : (
						hoverIndex >= 0 && (
							<span className="whitespace-normal break-words text-muted-foreground">
								{formatChapterLabel(chapters[hoverIndex], hoverIndex)}
							</span>
						)
					)}
				</div>
			)}
			<SliderPrimitive.Root
				min={start}
				max={end}
				step={1}
				// Scalar, not an array: Base UI passes a number with a single thumb.
				value={Math.max(start, Math.min(end, displayTime))}
				onValueChange={(val) => {
					setIsDragging(true);
					setDragValue(val);
				}}
				onValueCommitted={(val) => {
					setIsDragging(false);
					seekTo(val);
				}}
				onPointerDown={handleSeekStart}
				onPointerMove={handleSeekHover}
				onPointerEnter={handleSeekHover}
				onPointerLeave={() => setHoverPct(null)}
				aria-label={m["audiobook.player_seek"]()}
				className="group relative flex min-w-0 flex-1 cursor-pointer touch-none select-none items-center"
			>
				{/* Padding on the Control, not the Root: only the Control takes
					    pointer events. Vertical padding doesn't shift the value. */}
				<SliderPrimitive.Control
					className={cn(
						"relative flex min-w-0 flex-1 items-center",
						isLarge ? "py-3" : "py-2",
					)}
				>
					{/* Fixed-height shell: the track thickens on hover inside it, so
				    the growth never reflows the rows above (dock + expanded). */}
					<div className="relative flex h-1.5 w-full grow items-center">
						<SliderPrimitive.Track className="relative h-1 w-full overflow-hidden rounded-full bg-foreground/20 transition-[height] group-hover:h-1.5">
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
					</div>
					{!isChapterScope && (
						<BookmarkMarkers
							uuid={audiobook?.uuid ?? null}
							totalDuration={totalDuration}
						/>
					)}
					{/* pointer-events-none, or a press on the thumb would be a grab
						    instead of a jump. Dragging runs off the Control's capture. */}
					<SliderPrimitive.Thumb
						index={0}
						// Otherwise the position is announced as a raw second count.
						aria-valuetext={m["audiobook.player_seek_position"]({
							elapsed: formatTime(elapsed),
							total: formatTime(total),
						})}
						// Hidden until hover on a mouse, but a touch screen has no
						// hover: there the position marker has to be permanent.
						className="pointer-events-none block pointer-coarse:size-4 size-0 rounded-full bg-foreground transition-[width,height] focus-visible:size-4 focus-visible:outline-hidden group-hover:size-4"
					/>
				</SliderPrimitive.Control>
			</SliderPrimitive.Root>
		</div>
	);

	// Times under the bar and at its ends, so the track owns the full width.
	if (isLarge) {
		return (
			<div data-sheet-ignore className={cn("flex w-full flex-col", className)}>
				{track}
				<div className="-mt-2 flex items-baseline justify-between text-muted-foreground text-sm tabular-nums">
					<span>{formatTime(elapsed)}</span>
					<span>{rightLabel}</span>
				</div>
			</div>
		);
	}

	return (
		<div
			data-sheet-ignore
			className={cn("flex w-full items-center gap-2.5", className)}
		>
			<span className={cn(labelClass, "text-right")}>
				{formatTime(elapsed)}
			</span>
			{track}
			<span className={labelClass}>{rightLabel}</span>
		</div>
	);
});
