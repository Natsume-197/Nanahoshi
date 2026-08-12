import type {
	MixRow,
	RecommendationItem,
} from "@nanahoshi-v2/api/routers/recommendations/recommendations.model";

function appendRoundRobin(
	mixes: MixRow[],
	items: RecommendationItem[],
	seen: Set<string>,
	limit: number,
	accept: (item: RecommendationItem) => boolean,
): void {
	const longestMix = Math.max(0, ...mixes.map((mix) => mix.items.length));
	for (let rank = 0; rank < longestMix && items.length < limit; rank++) {
		for (const mix of mixes) {
			const item = mix.items[rank];
			if (!item || !accept(item) || seen.has(item.book.uuid)) continue;
			seen.add(item.book.uuid);
			items.push(item);
			if (items.length >= limit) break;
		}
	}
}

/**
 * Round-robin keeps every taste mix represented. Popular serving fallbacks are
 * appended only after all personalized candidates, so filling the rail never
 * displaces or interrupts a stronger recommendation.
 */
export function mergeRecommendationMixes(
	mixes: MixRow[],
	limit: number,
): RecommendationItem[] {
	const items: RecommendationItem[] = [];
	const seen = new Set<string>();
	appendRoundRobin(
		mixes,
		items,
		seen,
		limit,
		(item) => item.reason.type !== "popular",
	);
	appendRoundRobin(
		mixes,
		items,
		seen,
		limit,
		(item) => item.reason.type === "popular",
	);
	return items;
}
