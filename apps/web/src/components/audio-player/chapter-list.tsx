import { memo } from "react";
import { cn } from "@/lib/utils";
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
	variant?: "default" | "player";
}

export const ChapterList = memo(function ChapterList({
	chapters,
	currentTime,
	onSeekToChapter,
	variant = "default",
}: ChapterListProps) {
	if (chapters.length === 0) return null;

	let activeIndex = -1;
	for (let i = chapters.length - 1; i >= 0; i--) {
		if (currentTime >= (chapters[i]?.startTime ?? 0)) {
			activeIndex = i;
			break;
		}
	}
	const isPlayer = variant === "player";

	return (
		<div className="space-y-0.5">
			{!isPlayer && (
				<h3 className="mb-2 px-2 font-semibold text-sm">Chapters</h3>
			)}
			<div className={cn(!isPlayer && "max-h-[40vh] overflow-y-auto")}>
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
								{chapter.title ?? `Chapter ${chapter.index + 1}`}
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
