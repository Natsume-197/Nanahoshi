import { memo, useRef } from "react";
import { ChapterList } from "@/components/audio-player/chapter-list";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatChapterLabel } from "@/utils/chapters";

export const PlayerChapterPanel = memo(function PlayerChapterPanel({
	chapters,
	activeIndex,
	onSeekToChapter,
	className,
}: {
	chapters: {
		index: number;
		title: string | null;
		startTime: number;
		endTime: number;
	}[];
	/** Resolved by the caller, so the list stays off the playback tick. */
	activeIndex: number;
	onSeekToChapter: (startTime: number) => void;
	className?: string;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// Open on the chapter being played, not on chapter 1.
	useMountEffect(() => {
		const active = scrollRef.current?.querySelector("[data-active]");
		active?.scrollIntoView({ block: "center" });
	});

	return (
		<div className={cn("flex min-h-0 flex-col", className)}>
			<div className="flex shrink-0 items-baseline justify-between gap-2 px-2 pb-2">
				<p className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
					{m["audiobook.player_chapters"]()}
				</p>
				<span className="text-[11px] text-muted-foreground tabular-nums">
					{chapters.length}
				</span>
			</div>
			<div
				ref={scrollRef}
				data-sheet-ignore
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
			>
				<ChapterList
					chapters={chapters}
					currentTime={0}
					activeIndex={activeIndex}
					onSeekToChapter={onSeekToChapter}
					fallbackLabel={(index) => formatChapterLabel(undefined, index)}
				/>
			</div>
		</div>
	);
});
