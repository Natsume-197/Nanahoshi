import type { estypes } from "@elastic/elasticsearch";
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
		true,
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
	organizationId?: string,
	accessibleLibraryIds?: number[] | "ALL",
): QueryDslQueryContainer[] {
	const clauses = buildCommonFilters(
		filters,
		organizationId,
		accessibleLibraryIds,
	);

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

	return clauses;
}

export function buildSearchRequest(
	indexName: string,
	request: SearchBooksRequest,
): estypes.SearchRequest {
	const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
	const queryText = request.query?.trim();
	const hasQuery = !!queryText;
	const script = queryText ? detectInputScript(queryText) : "kanji";

	const must: QueryDslQueryContainer[] = [];
	if (queryText) {
		must.push(buildTextQuery(queryText, !!request.exactMatch, script));
	}

	const filter = buildFilters(
		request.filters,
		request.organizationId,
		request.accessibleLibraryIds,
	);
	const sort = buildSort(request.sort, hasQuery);

	return buildBaseSearchRequest({
		indexName,
		must,
		filter,
		sort,
		limit,
		hasQuery,
		cursor: request.cursor,
		offset: request.offset,
	});
}
