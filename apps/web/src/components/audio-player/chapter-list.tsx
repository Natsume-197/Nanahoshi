import { memo } from "react";
import { useAudioPlayerState } from "@/context/audio-player-context";
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

const BAR_DELAYS = ["0ms", "-300ms", "-600ms"];

/**
 * The active row's equalizer. Subscribes to playback on its own, so the rows
 * around it never re-render with the player's tick.
 */
function ActiveChapterEqualizer() {
	const { isPlaying } = useAudioPlayerState();
	return (
		<span aria-hidden className="inline-flex h-3 items-end gap-0.5">
			{BAR_DELAYS.map((delay) => (
				<span
					key={delay}
					className="now-playing-bar"
					data-playing={isPlaying ? "" : undefined}
					style={{ animationDelay: delay }}
				/>
			))}
		</span>
	);
}

/**
 * Chapter rows. Translucent surfaces instead of the app's opaque accent, so
 * they sit as well on the player's tinted scene as on a plain page: played
 * chapters recede, the playing one carries an equalizer,
 * and each row shows its length — what a listener weighs before jumping.
 */
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
		<ol className="flex flex-col gap-0.5">
			{chapters.map((chapter, position) => {
				const isActive = chapter.index === activeIndex;
				const isPlayed = activeIndex >= 0 && chapter.index < activeIndex;
				return (
					<li key={chapter.index}>
						<button
							type="button"
							data-active={isActive || undefined}
							aria-current={isActive || undefined}
							onClick={() => onSeekToChapter(chapter.startTime)}
							className={cn(
								"relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm outline-none transition-[background-color,color,transform] duration-150 hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] active:bg-foreground/[0.09]",
								isActive
									? "bg-foreground/[0.08] font-medium text-foreground hover:bg-foreground/[0.1]"
									: isPlayed
										? "text-muted-foreground/70 hover:text-muted-foreground"
										: "text-foreground/85 hover:text-foreground",
							)}
						>
							<span className="flex w-5 shrink-0 justify-center text-[11px] tabular-nums">
								{isActive ? (
									<ActiveChapterEqualizer />
								) : (
									<span className="text-muted-foreground/70">
										{position + 1}
									</span>
								)}
							</span>
							<span className="min-w-0 flex-1 truncate">
								{chapter.title ?? fallbackLabel(chapter.index)}
							</span>
							<span className="shrink-0 font-normal text-muted-foreground text-xs tabular-nums">
								{formatTime(Math.max(0, chapter.endTime - chapter.startTime))}
							</span>
						</button>
					</li>
				);
			})}
		</ol>
	);
});
