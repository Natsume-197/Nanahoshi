import type { estypes } from "@elastic/elasticsearch";
import type { SearchAudiobooksRequest } from "../search.types";
import {
	buildBaseSearchRequest,
	buildCommonFilters,
	buildNestedFieldQuery,
	buildSort,
	detectInputScript,
	type InputScript,
} from "./query-builder.utils";

type QueryDslQueryContainer = estypes.QueryDslQueryContainer;

const BOOSTS: Record<InputScript, Record<string, number>> = {
	kanji: {
		title: 10,
		"title.baseform": 5,
		"title.normalized": 4,
		"title.kana": 0,
		"authors.name": 8,
		"authors.name.baseform": 4,
		"authors.name.kana": 0,
		"narrators.name": 6,
		"narrators.name.baseform": 3,
		"narrators.name.kana": 0,
		description: 2,
		subtitle: 3,
	},
	kana: {
		title: 10,
		"title.baseform": 5,
		"title.normalized": 4,
		"title.kana": 3,
		"authors.name": 8,
		"authors.name.baseform": 4,
		"authors.name.kana": 3,
		"narrators.name": 6,
		"narrators.name.baseform": 3,
		"narrators.name.kana": 3,
		description: 2,
		subtitle: 3,
	},
	romaji: {
		title: 3,
		"title.baseform": 1,
		"title.normalized": 1,
		"title.kana": 5,
		"authors.name": 3,
		"authors.name.baseform": 1,
		"authors.name.kana": 5,
		"narrators.name": 3,
		"narrators.name.baseform": 1,
		"narrators.name.kana": 5,
		description: 1,
		subtitle: 1,
	},
};

const TOP_LEVEL_TEXT_FIELDS = [
	"title",
	"title.baseform",
	"title.normalized",
	"title.kana",
	"description",
	"subtitle",
];

const AUTHOR_TEXT_FIELDS = [
	"authors.name",
	"authors.name.baseform",
	"authors.name.normalized",
	"authors.name.kana",
];

const NARRATOR_TEXT_FIELDS = [
	"narrators.name",
	"narrators.name.baseform",
	"narrators.name.normalized",
	"narrators.name.kana",
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

	const queries: QueryDslQueryContainer[] = [topLevelQuery];

	const nestedAuthorQuery = buildNestedFieldQuery(
		"authors",
		AUTHOR_TEXT_FIELDS,
		boosts,
		effectiveQuery,
		true,
	);
	if (nestedAuthorQuery) queries.push(nestedAuthorQuery);

	const nestedNarratorQuery = buildNestedFieldQuery(
		"narrators",
		NARRATOR_TEXT_FIELDS,
		boosts,
		effectiveQuery,
	);
	if (nestedNarratorQuery) queries.push(nestedNarratorQuery);

	if (queries.length === 1) return topLevelQuery;

	return {
		dis_max: {
			queries,
			tie_breaker: 0.1,
		},
	};
}

function buildFilters(
	filters: SearchAudiobooksRequest["filters"],
	serverId?: string,
	accessibleLibraryIds?: number[] | "ALL",
): QueryDslQueryContainer[] {
	const clauses = buildCommonFilters(filters, serverId, accessibleLibraryIds);

	if (!filters) return clauses;

	if (filters.narrators?.length) {
		clauses.push({
			nested: {
				path: "narrators",
				query: {
					terms: { "narrators.name.keyword": filters.narrators },
				},
			},
		});
	}
	if (filters.narratorIds?.length) {
		clauses.push({
			nested: {
				path: "narrators",
				query: {
					terms: { "narrators.id": filters.narratorIds },
				},
			},
		});
	}

	return clauses;
}

export function buildAudiobookSearchRequest(
	indexName: string,
	request: SearchAudiobooksRequest,
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
		request.serverId,
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
