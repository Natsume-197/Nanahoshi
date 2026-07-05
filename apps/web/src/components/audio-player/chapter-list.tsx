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
	variant?: "default" | "player" | "detail";
	/** Fallback label for chapters without a title. Defaults to `Chapter {n}`. */
	fallbackLabel?: (index: number) => string;
}

export const ChapterList = memo(function ChapterList({
	chapters,
	currentTime,
	onSeekToChapter,
	variant = "default",
	fallbackLabel,
}: ChapterListProps) {
	if (chapters.length === 0) return null;

	const activeIndex = getActiveChapterIndex(chapters, currentTime);
	const isPlayer = variant === "player";
	// "detail" drops the heading + inner scroll cap so it flows in a detail tab.
	const showChrome = variant === "default";

	return (
		<div className="space-y-0.5">
			{showChrome && (
				<h3 className="mb-2 px-2 font-semibold text-sm">Chapters</h3>
			)}
			<div className={cn(showChrome && "max-h-[40vh] overflow-y-auto")}>
				{chapters.map((chapter) => {
					const isActive = chapter.index === activeIndex;
					return (
						<button
							key={chapter.index}
							type="button"
							onClick={() => onSeekToChapter(chapter.startTime)}
							className={cn(
								"flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
								isPlayer
									? cn(
											"hover:bg-white/10",
											isActive && "bg-white/10 font-medium text-white",
											!isActive && "text-white/50",
										)
									: cn(
											"hover:bg-accent",
											isActive && "bg-accent font-medium text-foreground",
											!isActive && "text-muted-foreground",
										),
							)}
						>
							<span className="min-w-0 truncate">
								{chapter.title ??
									fallbackLabel?.(chapter.index) ??
									`Chapter ${chapter.index + 1}`}
							</span>
							<span className="shrink-0 text-xs tabular-nums">
								{formatTime(chapter.startTime)}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
});
