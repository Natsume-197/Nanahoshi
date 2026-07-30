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
			<p className="shrink-0 px-2 pb-2 font-semibold text-sm">
				{m["audiobook.player_chapters"]()}
			</p>
			<div
				ref={scrollRef}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
			>
				<ChapterList
					chapters={chapters}
					currentTime={0}
					activeIndex={activeIndex}
					onSeekToChapter={onSeekToChapter}
					variant="detail"
					fallbackLabel={(index) => formatChapterLabel(undefined, index)}
				/>
			</div>
		</div>
	);
});
