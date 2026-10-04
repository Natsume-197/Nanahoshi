import { timeFor } from "./reading-history-model";

export interface DailyGoals {
	readingUnit: "characters" | "minutes";
	reading: number | null;
	listeningMinutes: number | null;
}
export interface TodayTotals {
	readingSeconds: number;
	characters: number;
}

/** Characters per hour for the live session; null until a minute and some advance exist. */
export function sessionSpeed(characters: number | null, seconds: number) {
	if (characters === null || characters <= 0 || seconds < 60) return null;
	return Math.round((characters / seconds) * 3600);
}

export interface ReadingGoalProgress {
	unit: "characters" | "minutes";
	target: number;
	done: number;
	ratio: number;
	remaining: number;
	// Reading time still needed at the measured pace; null when it cannot be estimated.
	remainingSeconds: number | null;
}

/**
 * Today's reading goal, measured across every book. `speed` is this book's
 * fraction per second and `bookChars` its length, so a character goal can be
 * turned into time left.
 */
export function readingGoalProgress(
	goals: DailyGoals | undefined,
	day: TodayTotals | null | undefined,
	speed: number | null,
	bookChars: number | null | undefined,
): ReadingGoalProgress | null {
	if (!goals || goals.reading === null || goals.reading <= 0) return null;
	const target = goals.reading;
	const done =
		goals.readingUnit === "characters"
			? (day?.characters ?? 0)
			: Math.floor((day?.readingSeconds ?? 0) / 60);
	const remaining = Math.max(0, target - done);
	const remainingSeconds =
		remaining === 0
			? 0
			: goals.readingUnit === "minutes"
				? remaining * 60
				: bookChars && bookChars > 0
					? timeFor(remaining / bookChars, speed)
					: null;
	return {
		unit: goals.readingUnit,
		target,
		done,
		ratio: done / target,
		remaining,
		remainingSeconds:
			remainingSeconds === null ? null : Math.ceil(remainingSeconds),
	};
}
