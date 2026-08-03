import { getActiveChapterIndex } from "@/utils/chapters";

export const SLEEP_DURATIONS = [5, 10, 15, 30, 45, 60] as const;
export type SleepDuration = (typeof SLEEP_DURATIONS)[number];

export const SLEEP_FADE_SECONDS = 20;
export const SLEEP_EXTEND_SECONDS = 300;

export type SleepTimerMode =
	| { kind: "duration"; minutes: number }
	| { kind: "chapter" };

export interface SleepTimerState {
	mode: SleepTimerMode;
	remaining: number;
}

export interface SleepTick {
	state: SleepTimerState | null;
	expired: boolean;
}

/** Falls back to the end of the book without chapters, or past the last one. */
export function chapterSecondsRemaining(
	chapters: { startTime: number; endTime: number }[],
	globalTime: number,
	totalDuration: number,
): number {
	const chapter = chapters[getActiveChapterIndex(chapters, globalTime)];
	if (chapter && globalTime < chapter.endTime) {
		return Math.max(0, chapter.endTime - globalTime);
	}
	return Math.max(0, totalDuration - globalTime);
}

export function createSleepTimer(
	mode: SleepTimerMode,
	context: {
		chapters: { startTime: number; endTime: number }[];
		globalTime: number;
		totalDuration: number;
	},
): SleepTimerState {
	const remaining =
		mode.kind === "duration"
			? mode.minutes * 60
			: chapterSecondsRemaining(
					context.chapters,
					context.globalTime,
					context.totalDuration,
				);
	return { mode, remaining };
}

/**
 * A chapter timer re-reads its target from the playhead instead of counting
 * down blindly: seeking, a chapter skip or a speed change all move the real end
 * of the chapter.
 */
export function tickSleepTimer(
	state: SleepTimerState | null,
	elapsed: number,
	context: {
		chapters: { startTime: number; endTime: number }[];
		globalTime: number;
		totalDuration: number;
		speed: number;
	},
): SleepTick {
	if (!state) return { state: null, expired: false };

	if (state.mode.kind === "chapter") {
		const remaining =
			chapterSecondsRemaining(
				context.chapters,
				context.globalTime,
				context.totalDuration,
			) / Math.max(0.1, context.speed);
		if (remaining <= 0.5) return { state: null, expired: true };
		return { state: { ...state, remaining }, expired: false };
	}

	const remaining = state.remaining - elapsed;
	if (remaining <= 0) return { state: null, expired: true };
	return { state: { ...state, remaining }, expired: false };
}

export function extendSleepTimer(
	state: SleepTimerState | null,
	seconds: number = SLEEP_EXTEND_SECONDS,
): SleepTimerState | null {
	if (!state) return null;
	// Extending "end of chapter" means "keep going a bit", which is no longer
	// chapter-bound.
	return {
		mode: { kind: "duration", minutes: (state.remaining + seconds) / 60 },
		remaining: state.remaining + seconds,
	};
}

export function sleepFadeFactor(
	remaining: number,
	fadeSeconds = SLEEP_FADE_SECONDS,
): number {
	if (fadeSeconds <= 0) return 1;
	if (remaining >= fadeSeconds) return 1;
	return Math.max(0, Math.min(1, remaining / fadeSeconds));
}
