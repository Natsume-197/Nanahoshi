export type WorkKind = "series" | "book";

// stable map key for the polymorphic (kind, id) pair
export type WorkKey = `${WorkKind}:${number}`;

export const workKey = (kind: WorkKind, id: number): WorkKey => `${kind}:${id}`;

export function parseWorkKey(key: WorkKey): { kind: WorkKind; id: number } {
	const idx = key.indexOf(":");
	return {
		kind: key.slice(0, idx) as WorkKind,
		id: Number(key.slice(idx + 1)),
	};
}

export interface WorkAggregate {
	kind: WorkKind;
	id: number;
	authorIds: Set<number>;
	genreIds: Set<number>;
	tagIds: Set<number>;
	publisherIds: Set<number>;
	languageCode: string | null;
	memberBookIds: number[];
	embeddingText: string;
	engagedUserIds: Set<string>;
	likeCount: number;
	completionCount: number;
	amazonRating: number | null;
	amazonReviewCount: number | null;
	// max member book created_at, for deterministic recency tiebreaks
	createdAtMs: number;
}

export type RecommendationReason =
	| "because_you_liked"
	| "same_author"
	| "shared_genres"
	| "similar_content"
	| "same_publisher"
	| "readers_also_liked"
	| "popular";

export interface ScoredPair {
	seed: WorkKey;
	cand: WorkKey;
	score: number;
	components: Record<string, number>;
	reason: RecommendationReason;
}
