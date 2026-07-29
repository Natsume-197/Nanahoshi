import type { TopHit } from "@nanahoshi-v2/api/routers/search/search.model";
import {
	rankTopResults,
	type TopResultPools,
} from "@nanahoshi-v2/api/routers/search/search.ranking";

export function searchResultKey(hit: TopHit): string {
	switch (hit.type) {
		case "book":
		case "audiobook":
		case "series":
		case "author":
			return `${hit.type}-${hit.uuid}`;
		case "collection":
			return `collection-${hit.id}`;
		case "user":
			return `user-${hit.username ?? hit.name}`;
	}
}

export function mergeStableSearchResults(
	previous: TopHit[],
	latestRanked: TopHit[],
): TopHit[] {
	const remaining = new Map(
		latestRanked.map((hit) => [searchResultKey(hit), hit]),
	);
	const merged = previous.flatMap((hit) => {
		const key = searchResultKey(hit);
		const latest = remaining.get(key);
		if (!latest) return [];
		remaining.delete(key);
		return [latest];
	});

	for (const hit of latestRanked) {
		if (remaining.delete(searchResultKey(hit))) merged.push(hit);
	}

	if (
		merged.length === previous.length &&
		merged.every((hit, index) => hit === previous[index])
	) {
		return previous;
	}
	return merged;
}

export function rankSearchResultBatches(
	batches: TopResultPools[],
	query: string,
): TopHit[] {
	const seen = new Set<string>();
	const results: TopHit[] = [];

	for (const batch of batches) {
		const resultCount = Object.values(batch).reduce(
			(total, entries) => total + entries.length,
			0,
		);
		for (const hit of rankTopResults(batch, query, resultCount)) {
			const key = searchResultKey(hit);
			if (seen.has(key)) continue;
			seen.add(key);
			results.push(hit);
		}
	}

	return results;
}
