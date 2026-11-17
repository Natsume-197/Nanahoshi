import { formatDuration, titleOrUntitled } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { SeedPerson, TitleSeed } from "@/lib/title-seed";

export type HeroFields = {
	title: string;
	subtitle: string | null;
	cover: string | null;
	color: string | null;
	authors: SeedPerson[];
};

/**
 * What the hero draws: the detail once it is here, until then what the tapped
 * tile showed (the rest of the page waits on the detail), else nothing.
 */
export function detailHero(
	data:
		| {
				title?: string | null;
				filename?: string | null;
				subtitle?: string | null;
				cover?: string | null;
				mainColor?: string | null;
				authors: SeedPerson[];
		  }
		| undefined,
	seed: TitleSeed | null,
): HeroFields | null {
	if (data)
		return {
			title: titleOrUntitled(data.title ?? data.filename),
			subtitle: data.subtitle ?? null,
			cover: data.cover ?? null,
			color: data.mainColor ?? null,
			authors: data.authors,
		};
	if (!seed) return null;
	return {
		title: titleOrUntitled(seed.title),
		subtitle: null,
		cover: seed.cover,
		color: seed.color,
		authors: seed.authors,
	};
}

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

/**
 * The audiobook hero's narrator line: held empty while only the tapped tile
 * is known (tiles don't carry narrators), then the names, or gone for a
 * title that has none.
 */
export function narratorLine(
	narrators: readonly unknown[] | undefined,
): "reserve" | "names" | "none" {
	if (narrators === undefined) return "reserve";
	return narrators.length > 0 ? "names" : "none";
}
