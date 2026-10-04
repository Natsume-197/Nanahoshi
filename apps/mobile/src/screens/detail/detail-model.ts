import { formatDuration } from "@/lib/format";
import { t } from "@/lib/i18n";

/** Label and second line of the hero's primary button. */
export function primaryAction({
	audio,
	progress,
	playing,
	duration,
	position,
}: {
	audio: boolean;
	/** 0–100. */
	progress: number;
	playing: boolean;
	/** Audiobooks: whole length and saved position, in seconds. */
	duration?: number | null;
	position?: number | null;
}): { label: string; detail: string | null } {
	if (playing) return { label: t("audiobook.player_pause"), detail: null };
	const started = progress > 0;
	if (!audio)
		return started
			? {
					label: t("book.continue_reading"),
					detail: `${progress}%`,
				}
			: { label: t("book.read"), detail: null };
	if (!started)
		return { label: t("audiobook.listen"), detail: formatDuration(duration) };
	const left = formatDuration((duration ?? 0) - (position ?? 0));
	return {
		label: t("audiobook.continue_listening"),
		detail: left ? t("home.remaining_time", { time: left }) : null,
	};
}

/** Index of the chapter the saved position falls in, or -1. */
export function currentChapter(
	chapters: { startTime: number; endTime: number }[],
	position: number,
) {
	if (position <= 0) return -1;
	return chapters.findIndex(
		(chapter) => position >= chapter.startTime && position < chapter.endTime,
	);
}
