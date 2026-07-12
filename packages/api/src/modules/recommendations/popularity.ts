import type { WorkAggregate } from "./types";

const BAYES_PSEUDO_REVIEWS = 25;
const BAYES_PRIOR_RATING = 3.5;

export interface PopularityEntry {
	kind: WorkAggregate["kind"];
	id: number;
	likeCount: number;
	completionCount: number;
	engagedUserCount: number;
	amazonRating: number | null;
	amazonReviewCount: number | null;
	score: number;
}

export function computePopularity(works: WorkAggregate[]): PopularityEntry[] {
	const maxLikes = Math.max(0, ...works.map((w) => w.likeCount));
	const maxCompletions = Math.max(0, ...works.map((w) => w.completionCount));
	const maxEngagedUsers = Math.max(
		0,
		...works.map((w) => w.engagedUserIds.size),
	);
	const logMaxLikes = Math.log1p(maxLikes);
	const logMaxCompletions = Math.log1p(maxCompletions);
	const logMaxEngagedUsers = Math.log1p(maxEngagedUsers);

	const entries = works.map((w) => {
		const n = w.amazonReviewCount ?? 0;
		const rating = w.amazonRating ?? BAYES_PRIOR_RATING;
		const bayes =
			(rating * n + BAYES_PRIOR_RATING * BAYES_PSEUDO_REVIEWS) /
			(n + BAYES_PSEUDO_REVIEWS);
		const hasRating = w.amazonRating !== null && n > 0;
		const ratingTerm = hasRating ? (bayes - 1) / 4 : 0; // missing data is not popularity

		const likeTerm =
			logMaxLikes === 0 ? 0 : Math.log1p(w.likeCount) / logMaxLikes;
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
			likeCount: w.likeCount,
			completionCount: w.completionCount,
			engagedUserCount: w.engagedUserIds.size,
			amazonRating: w.amazonRating,
			amazonReviewCount: w.amazonReviewCount,
			score: Math.min(
				1,
				Math.max(
					0,
					0.4 * ratingTerm +
						0.25 * likeTerm +
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
