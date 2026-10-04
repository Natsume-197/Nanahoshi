/** Pure helpers shared by the engine and the player UI (ports of the web's
 * utils/chapters, player-preferences, sleep-timer and smart-rewind). */

export type Chapter = {
	index: number;
	title: string | null;
	startTime: number;
	endTime: number;
};

export const JUMP_BACK = 10;
export const JUMP_FORWARD = 30;
export const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 3;
export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;

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
