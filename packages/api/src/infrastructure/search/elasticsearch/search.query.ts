import type { estypes } from "@elastic/elasticsearch";
import { parseVolumeIntent } from "../volume-intent";
import {
	buildBaseSearchRequest,
	buildCommonFilters,
	buildNestedFieldQuery,
	buildSort,
	decodeCursor,
	detectInputScript,
	encodeCursor,
	type InputScript,
} from "./query-builder.utils";
import type { SearchBooksRequest } from "./search.types";

type QueryDslQueryContainer = estypes.QueryDslQueryContainer;

// Re-export shared utilities so existing import sites don't break
export { buildSort, decodeCursor, detectInputScript, encodeCursor };

const BOOSTS: Record<InputScript, Record<string, number>> = {
	kanji: {
		title: 10,
		"title.baseform": 5,
		"title.normalized": 4,
		"title.kana": 0,
		"authors.name": 8,
		"authors.name.baseform": 4,
		"authors.name.kana": 0,
		description: 2,
		subtitle: 3,
		titleRomaji: 0,
		"series.name": 7,
		"series.aliases": 5,
	},
	kana: {
		title: 10,
		"title.baseform": 5,
		"title.normalized": 4,
		"title.kana": 3,
		"authors.name": 8,
		"authors.name.baseform": 4,
		"authors.name.kana": 3,
		description: 2,
		subtitle: 3,
		titleRomaji: 0,
		"series.name": 7,
		"series.aliases": 5,
	},
	romaji: {
		title: 3,
		"title.baseform": 1,
		"title.normalized": 1,
		"title.kana": 5,
		"authors.name": 3,
		"authors.name.baseform": 1,
		"authors.name.kana": 5,
		description: 1,
		subtitle: 1,
		titleRomaji: 8,
		"series.name": 5,
		"series.aliases": 4,
	},
};

const TOP_LEVEL_TEXT_FIELDS = [
	"title",
	"title.baseform",
	"title.normalized",
	"title.kana",
	"description",
	"subtitle",
	"titleRomaji",
	"series.name",
	"series.aliases",
];

const AUTHOR_TEXT_FIELDS = [
	"authors.name",
	"authors.name.baseform",
	"authors.name.normalized",
	"authors.name.kana",
];

function buildTextQuery(
	queryText: string,
	exactMatch: boolean,
	script: InputScript,
): QueryDslQueryContainer {
	const boosts = BOOSTS[script];
	const effectiveQuery = exactMatch ? `"${queryText}"` : queryText;

	const topLevelFields = TOP_LEVEL_TEXT_FIELDS.filter(
		(f) => (boosts[f] ?? 0) > 0,
	).map((f) => `${f}^${boosts[f]}`);

	const topLevelQuery: QueryDslQueryContainer = {
		simple_query_string: {
			query: effectiveQuery,
			fields: topLevelFields,
			default_operator: "and",
			analyze_wildcard: true,
		},
	};

	const nestedAuthorQuery = buildNestedFieldQuery(
		"authors",
		AUTHOR_TEXT_FIELDS,
		boosts,
		effectiveQuery,
	);

	if (!nestedAuthorQuery) return topLevelQuery;

	return {
		dis_max: {
			queries: [topLevelQuery, nestedAuthorQuery],
			tie_breaker: 0.1,
		},
	};
}

function buildFilters(
	filters: SearchBooksRequest["filters"],
	serverId?: string,
	accessibleLibraryIds?: number[] | "ALL",
): QueryDslQueryContainer[] {
	const clauses = buildCommonFilters(filters, serverId, accessibleLibraryIds);

	if (!filters) return clauses;

	if (filters.pageCountRange) {
		const range: Record<string, number> = {};
		if (filters.pageCountRange.min != null)
			range.gte = filters.pageCountRange.min;
		if (filters.pageCountRange.max != null)
			range.lte = filters.pageCountRange.max;
		if (Object.keys(range).length > 0) {
			clauses.push({ range: { pageCount: range } });
		}
	}

	if (filters.publishers?.length) {
		clauses.push({ terms: { "publisher.name.keyword": filters.publishers } });
	}

	if (filters.minRating != null) {
		clauses.push({ range: { rating: { gte: filters.minRating } } });
	}

	return clauses;
}

/**
 * Wraps the text query with relevance nudges: well-rated books get a gentle
 * lift (`boost_mode: sum` adds a small bonus on top of the text score rather
 * than letting rating dominate; unrated books get no bonus), and when the
 * query carried a volume number, books at that series position jump ahead.
 */
function withRelevanceBoosts(
	query: QueryDslQueryContainer,
	volume: number | null,
): QueryDslQueryContainer {
	const functions: estypes.QueryDslFunctionScoreContainer[] = [
		{
			field_value_factor: {
				field: "rating",
				factor: 0.5,
				modifier: "ln1p",
				missing: 0,
			},
		},
	];
	if (volume != null) {
		// Title number is ground truth for "tomo N"; series position can drift
		// (side stories shift later positions), so it boosts less.
		functions.push({
			filter: { term: { titleVolume: volume } },
			weight: 200,
		});
		functions.push({
			filter: { term: { seriesPosition: volume } },
			weight: 100,
		});
	}
	return {
		function_score: {
			query,
			functions,
			boost_mode: "sum",
			score_mode: "sum",
		},
	};
}

export function buildSearchRequest(
	indexName: string,
	request: SearchBooksRequest,
): estypes.SearchRequest {
	const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
	const queryText = request.query?.trim();
	const hasQuery = !!queryText;
	const script = queryText ? detectInputScript(queryText) : "kanji";
	const intent = queryText
		? request.exactMatch
			? { text: queryText, volume: null }
			: parseVolumeIntent(queryText)
		: { text: "", volume: null };

	// Rating only nudges the relevance ranking (the sort that consumes _score).
	const isRelevance = !request.sort || request.sort === "relevance";
	const must: QueryDslQueryContainer[] = [];
	if (queryText) {
		const base = buildTextQuery(queryText, !!request.exactMatch, script);
		// With volume intent, also match on the stripped text so every volume of
		// the series is recalled, not just titles containing the number.
		const textQuery: QueryDslQueryContainer =
			intent.volume != null
				? {
						dis_max: {
							queries: [base, buildTextQuery(intent.text, false, script)],
							tie_breaker: 0,
						},
					}
				: base;
		must.push(
			isRelevance ? withRelevanceBoosts(textQuery, intent.volume) : textQuery,
		);
	}

	const filter = buildFilters(
		request.filters,
		request.serverId,
		request.accessibleLibraryIds,
	);
	const sort = buildSort(
		request.sort,
		hasQuery,
		queryText
			? {
					original: queryText,
					matchText: intent.text,
					volume: intent.volume,
				}
			: undefined,
	);

	return buildBaseSearchRequest({
		indexName,
		must,
		filter,
		sort,
		limit,
		cursor: request.cursor,
		offset: request.offset,
	});
}
