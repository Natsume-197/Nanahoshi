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

/** Scroll distance over which the detail bar fades in, from the moment the
 * hero title's top meets the bar's bottom edge. */
const HEADER_FADE = 40;

/**
 * How solid the floating detail bar is, 0–1: it fades in as the hero title
 * (`titleOffset`, in scroll content) slides under it. Runs per scroll frame
 * on the UI thread.
 */
export function headerSolidProgress({
	scrollY,
	titleOffset,
	barBottom,
}: {
	scrollY: number;
	titleOffset: number | null;
	barBottom: number;
}) {
	"worklet";
	if (titleOffset === null) return 0;
	const past = scrollY + barBottom - titleOffset;
	return Math.min(1, Math.max(0, past / HEADER_FADE));
}
