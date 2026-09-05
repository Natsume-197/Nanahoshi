import { useCallback } from "react";
import {
	type Chapter,
	ChapterList,
} from "@/components/audio-player/chapter-list";
import {
	toPlayerData,
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import type { getAudiobook } from "@/functions/books/get-audiobook";
import { m } from "@/paraglide/messages";
import { getActiveChapterIndex } from "@/utils/chapters";

type AudiobookData = NonNullable<Awaited<ReturnType<typeof getAudiobook>>>;

const EMPTY_CHAPTERS: Chapter[] = [];
const chapterFallbackLabel = (index: number) =>
	m["audiobook.chapter_fallback"]({ number: index + 1 });

export function ChaptersSection({ audiobook }: { audiobook: AudiobookData }) {
	const playerBook = useAudioPlayerBook();
	const { globalCurrentTime } = useAudioPlayerState();
	const { loadAudiobook, seekTo } = useAudioPlayerActions();

	const isActive = playerBook?.uuid === audiobook.uuid;
	const chapters: Chapter[] = audiobook.chapters ?? EMPTY_CHAPTERS;
	const activeIndex = isActive
		? getActiveChapterIndex(chapters, globalCurrentTime)
		: -1;

	// Jump to a chapter: seek if this book already drives the player, otherwise
	// load it starting at the chapter (startTime overrides the saved position).
	const seekToChapter = useCallback(
		(startTime: number) => {
			if (isActive) {
				seekTo(startTime);
			} else {
				loadAudiobook(toPlayerData(audiobook), { startTime });
			}
		},
		[isActive, seekTo, loadAudiobook, audiobook],
	);

	return (
		<ChapterList
			chapters={chapters}
			currentTime={-1}
			activeIndex={activeIndex}
			onSeekToChapter={seekToChapter}
			fallbackLabel={chapterFallbackLabel}
		/>
	);
}
