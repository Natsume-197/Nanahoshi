/** Pure helpers shared by the engine and the player UI (ports of the web's
 * utils/chapters, player-preferences, sleep-timer and smart-rewind). */

export type Chapter = {
	index: number;
	title: string | null;
	startTime: number;
	endTime: number;
};

export const JUMP_AMOUNTS = [5, 10, 15, 30, 60] as const;
export type JumpAmount = (typeof JUMP_AMOUNTS)[number];
export const DEFAULT_JUMP_BACK: JumpAmount = 10;
export const DEFAULT_JUMP_FORWARD: JumpAmount = 30;
export const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 5;
const SPEED_STEP = 0.1;
export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;
export const SLEEP_EXTEND_SECONDS = 300;
/** The last seconds of a sleep timer fade the volume out instead of cutting. */
export const SLEEP_FADE_SECONDS = 20;

export type SleepMode =
	| { kind: "duration"; minutes: number }
	| { kind: "chapter" }
	| { kind: "book-end" };

export function clampSpeed(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return (
		Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, value)) * 100) / 100
	);
}

export function nudgeSpeed(current: number, steps: number): number {
	return clampSpeed(
		Math.round((current + steps * SPEED_STEP) * 10 + Number.EPSILON) / 10,
	);
}

export function normalizeJumpAmount(
	value: unknown,
	fallback: JumpAmount,
): JumpAmount {
	const parsed = typeof value === "string" ? Number(value) : value;
	return JUMP_AMOUNTS.includes(parsed as JumpAmount)
		? (parsed as JumpAmount)
		: fallback;
}

export function formatSpeed(value: number): string {
	const rounded = Math.round(value * 100) / 100;
	return `${rounded}×`;
}

/** Index of the chapter playing at `time` (the last one that has started). */
export function activeChapterIndex(chapters: Chapter[], time: number): number {
	let found = -1;
	for (let index = 0; index < chapters.length; index++) {
		if (chapters[index].startTime <= time + 0.25) found = index;
		else break;
	}
	return found;
}

/** `time` as the seek bar shows it: into its chapter, or into the book. */
export function clockIn(
	chapters: Chapter[],
	time: number,
	scope: "chapter" | "book",
): string {
	const index = scope === "chapter" ? activeChapterIndex(chapters, time) : -1;
	return clock(index >= 0 ? time - chapters[index].startTime : time);
}

/** h:mm:ss above an hour, m:ss below — the web's formatTime. */
export function clock(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const ss = String(s).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Pause longer than 10 min rewinds 10 s on resume, over an hour 30 s. */
export function smartRewind(pausedMs: number, currentTime: number): number {
	if (!Number.isFinite(pausedMs) || pausedMs < 10 * 60_000 || currentTime <= 0)
		return 0;
	return Math.min(pausedMs >= 60 * 60_000 ? 30 : 10, currentTime);
}

/** "+5 min" turns any timer into a plain countdown: past the chapter's end
 * is no longer chapter-bound. */
export function extendSleep(remaining: number): {
	mode: SleepMode;
	remaining: number;
} {
	const next = remaining + SLEEP_EXTEND_SECONDS;
	return { mode: { kind: "duration", minutes: next / 60 }, remaining: next };
}

export function sleepFadeFactor(remaining: number): number {
	if (remaining >= SLEEP_FADE_SECONDS) return 1;
	return Math.max(0, Math.min(1, remaining / SLEEP_FADE_SECONDS));
}

/** Where the bar starts and ends, and what the times under it read, in book
 * scope or narrowed to the playing chapter (the web's getProgressReadout). */
export function progressReadout(
	scope: "book" | "chapter",
	time: number,
	duration: number,
	chapter: { startTime: number; endTime: number } | undefined,
) {
	const useChapter = scope === "chapter" && chapter != null;
	const start = useChapter ? chapter.startTime : 0;
	const end = useChapter ? chapter.endTime : duration;
	const total = Math.max(0, end - start);
	const elapsed = Math.max(0, Math.min(total, time - start));
	return { start, end, total, elapsed, remaining: total - elapsed };
}

/** Wall-clock seconds a stretch of book takes at the current rate. */
export function realTimeAt(seconds: number, speed: number): number {
	return seconds / Math.max(0.1, speed);
}

/** Next book in a series listing that already comes in reading order. */
export function findNextInSeries<T extends { uuid: string }>(
	currentUuid: string,
	books: readonly T[],
): T | null {
	const index = books.findIndex((book) => book.uuid === currentUuid);
	if (index < 0 || index + 1 >= books.length) return null;
	return books[index + 1];
}

/** Where `times` fall on a track spanning `start`–`end`, as fractions; the
 * ones outside it are left off. */
export function positionsInSpan(
	times: readonly number[],
	start: number,
	end: number,
): number[] {
	const span = end - start;
	if (span <= 0) return [];
	return times
		.filter((time) => time >= start && time <= end)
		.map((time) => (time - start) / span);
}
