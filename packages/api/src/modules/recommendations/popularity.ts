import type { WorkAggregate } from "./types";

const BAYES_PSEUDO_REVIEWS = 25;
const BAYES_PRIOR_RATING = 3.5;

export interface PopularityEntry {
	kind: WorkAggregate["kind"];
	id: number;
	collectionCount: number;
	completionCount: number;
	engagedUserCount: number;
	rating: number | null;
	ratingCount: number | null;
	score: number;
}

export function computePopularity(works: WorkAggregate[]): PopularityEntry[] {
	const maxCollections = Math.max(0, ...works.map((w) => w.collectionCount));
	const maxCompletions = Math.max(0, ...works.map((w) => w.completionCount));
	const maxEngagedUsers = Math.max(
		0,
		...works.map((w) => w.engagedUserIds.size),
	);
	const logMaxCollections = Math.log1p(maxCollections);
	const logMaxCompletions = Math.log1p(maxCompletions);
	const logMaxEngagedUsers = Math.log1p(maxEngagedUsers);

	const entries = works.map((w) => {
		const n = w.ratingCount ?? 0;
		const rating = w.rating ?? BAYES_PRIOR_RATING;
		const bayes =
			(rating * n + BAYES_PRIOR_RATING * BAYES_PSEUDO_REVIEWS) /
			(n + BAYES_PSEUDO_REVIEWS);
		const hasRating = w.rating !== null && n > 0;
		const ratingTerm = hasRating ? (bayes - 1) / 4 : 0; // missing data is not popularity

		const collectionTerm =
			logMaxCollections === 0
				? 0
				: Math.log1p(w.collectionCount) / logMaxCollections;
		const completionTerm =
			logMaxCompletions === 0
				? 0
				: Math.log1p(w.completionCount) / logMaxCompletions;
		const engagedTerm =
			logMaxEngagedUsers === 0
				? 0
				: Math.log1p(w.engagedUserIds.size) / logMaxEngagedUsers;

		return {
			kind: w.kind,
			id: w.id,
			collectionCount: w.collectionCount,
			completionCount: w.completionCount,
			engagedUserCount: w.engagedUserIds.size,
			rating: w.rating,
			ratingCount: w.ratingCount,
			score: Math.min(
				1,
				Math.max(
					0,
					0.4 * ratingTerm +
						0.25 * collectionTerm +
						0.2 * completionTerm +
						0.15 * engagedTerm,
				),
			),
			createdAtMs: w.createdAtMs,
		};
	});

	// deterministic order: score desc, then recency desc, then id
	entries.sort(
		(a, b) => b.score - a.score || b.createdAtMs - a.createdAtMs || a.id - b.id,
	);
	return entries.map(({ createdAtMs: _, ...rest }) => rest);
}
