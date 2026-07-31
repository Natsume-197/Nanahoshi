import { memo } from "react";
import { cn } from "@/lib/utils";
import { getActiveChapterIndex } from "@/utils/chapters";
import { formatTime } from "@/utils/format";

export type Chapter = {
	index: number;
	title: string | null;
	startTime: number;
	endTime: number;
};

interface ChapterListProps {
	chapters: Chapter[];
	currentTime: number;
	onSeekToChapter: (startTime: number) => void;
	/** Label for chapters without a title. */
	fallbackLabel: (index: number) => string;
	/** Pre-resolved active chapter. Lets a caller that already knows it keep this
	 *  list out of the playback tick. */
	activeIndex?: number;
}

export const ChapterList = memo(function ChapterList({
	chapters,
	currentTime,
	onSeekToChapter,
	fallbackLabel,
	activeIndex: activeIndexProp,
}: ChapterListProps) {
	if (chapters.length === 0) return null;

	const activeIndex =
		activeIndexProp ?? getActiveChapterIndex(chapters, currentTime);

	return (
		<div className="space-y-0.5">
			{chapters.map((chapter) => {
				const isActive = chapter.index === activeIndex;
				return (
					<button
						key={chapter.index}
						type="button"
						data-active={isActive || undefined}
						aria-current={isActive || undefined}
						onClick={() => onSeekToChapter(chapter.startTime)}
						className={cn(
							"relative flex w-full items-center justify-between gap-3 rounded-md py-2 pr-2 pl-3 text-left text-sm transition-colors hover:bg-accent",
							isActive
								? "bg-accent font-medium text-foreground"
								: "text-muted-foreground",
						)}
					>
						{isActive && (
							<span
								aria-hidden
								className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
							/>
						)}
						<span className="min-w-0 truncate">
							{chapter.title ?? fallbackLabel(chapter.index)}
						</span>
						<span className="shrink-0 text-xs tabular-nums">
							{formatTime(chapter.startTime)}
						</span>
					</button>
				);
			})}
		</div>
	);
});
