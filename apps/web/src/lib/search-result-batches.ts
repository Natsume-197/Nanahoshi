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
		case "read-listen":
			return `read-listen-${hit.id}`;
		case "collection":
			return `collection-${hit.id}`;
		case "user":
			return `user-${hit.username ?? hit.name}`;
	}
}

export function rankSearchResultBatches(
	batches: TopResultPools[],
	query: string,
	initialResults: TopHit[] = [],
): TopHit[] {
	const seen = new Set(initialResults.map(searchResultKey));
	const results = [...initialResults];

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
