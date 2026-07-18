// Tiny standalone module: the settings router reads this without pulling the
// whole rebuild pipeline (embedder, candidate generation) into the API process.

export const LAST_RUN_KEY = "recommendations.lastRun";

export interface RecommendationLastRun {
	finishedAt: string;
	mode: "full" | "feeds" | "incremental";
	durationMs: number;
	works: number;
	similarities: number;
	/** Member feeds computed (or eligible) in this run. */
	members: number;
	catalogChanged: boolean;
	engagementChanged: boolean;
	/** Per-phase wall-clock ms (embedMs, similaritiesMs, feedsMs, ...). */
	timings: Record<string, number>;
}
