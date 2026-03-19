import type { estypes } from "@elastic/elasticsearch";
import type { SearchBooksRequest, SearchSort } from "./search.types";

type QueryDslQueryContainer = estypes.QueryDslQueryContainer;
type SearchRequest = estypes.SearchRequest;
type Sort = estypes.Sort;

type InputScript = "kanji" | "kana" | "romaji";

// Regex patterns for Japanese script detection
const KANJI_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const KANA_REGEX = /[\u3040-\u309F\u30A0-\u30FF]/;

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

function detectInputScript(query: string): InputScript {
	if (KANJI_REGEX.test(query)) return "kanji";
	if (KANA_REGEX.test(query)) return "kana";
	return "romaji";
}

function encodeCursor(sortValues: unknown[]): string {
	return Buffer.from(JSON.stringify(sortValues)).toString("base64url");
}

function decodeCursor(cursor: string): unknown[] {
	return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
}

// Top-level text fields (non-nested)
const TOP_LEVEL_TEXT_FIELDS = [
	"title",
	"title.baseform",
	"title.normalized",
	"title.kana",
	"description",
	"subtitle",
	"titleRomaji",
];

// Nested author fields
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

	// Build top-level fields query
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

	// Build nested author query
	const authorFields = AUTHOR_TEXT_FIELDS.filter(
		(f) => (boosts[f] ?? 0) > 0,
	).map((f) => `${f}^${boosts[f]}`);

	if (authorFields.length === 0) {
		return topLevelQuery;
	}

	const nestedAuthorQuery: QueryDslQueryContainer = {
		nested: {
			path: "authors",
			query: {
				simple_query_string: {
					query: effectiveQuery,
					fields: authorFields,
					default_operator: "and",
					analyze_wildcard: true,
				},
			},
			inner_hits: {
				_source: false,
				highlight: {
					fields: {
						"authors.name": {
							type: "unified",
							number_of_fragments: 1,
							pre_tags: ["<em>"],
							post_tags: ["</em>"],
						},
					},
				},
			},
		},
	};

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
): QueryDslQueryContainer[] {
	const clauses: QueryDslQueryContainer[] = [];

	if (organizationId) {
		clauses.push({ term: { organizationId } });
	}

	if (!filters) return clauses;

	if (filters.languageCode?.length) {
		clauses.push({ terms: { languageCode: filters.languageCode } });
	}

	if (filters.publishedDateRange) {
		const range: Record<string, string> = {};
		if (filters.publishedDateRange.from)
			range.gte = filters.publishedDateRange.from;
		if (filters.publishedDateRange.to)
			range.lte = filters.publishedDateRange.to;
		if (Object.keys(range).length > 0) {
			clauses.push({ range: { publishedDate: range } });
		}
	}

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

	if (filters.authors?.length) {
		clauses.push({
			nested: {
				path: "authors",
				query: {
					terms: { "authors.name.keyword": filters.authors },
				},
			},
		});
	}
	if (filters.authorIds?.length) {
		clauses.push({
			nested: {
				path: "authors",
				query: {
					terms: { "authors.id": filters.authorIds },
				},
			},
		});
	}

	if (filters.series?.length) {
		clauses.push({ terms: { "series.name.keyword": filters.series } });
	}

	if (filters.publishers?.length) {
		clauses.push({ terms: { "publisher.name.keyword": filters.publishers } });
	}

	return clauses;
}

function buildSort(sort: SearchSort | undefined, hasQuery: boolean): Sort {
	switch (sort) {
		case "newest":
			return [{ createdAt: { order: "desc" } }, { _doc: { order: "asc" } }];
		case "oldest":
			return [{ createdAt: { order: "asc" } }, { _doc: { order: "asc" } }];
		case "title_asc":
			return [
				{ "title.keyword": { order: "asc" } },
				{ _doc: { order: "asc" } },
			];
		case "title_desc":
			return [
				{ "title.keyword": { order: "desc" } },
				{ _doc: { order: "asc" } },
			];
		default:
			if (hasQuery) {
				return [
					{ _score: { order: "desc" } },
					{ createdAt: { order: "desc" } },
					{ _doc: { order: "asc" } },
				];
			}
			return [{ createdAt: { order: "desc" } }, { _doc: { order: "asc" } }];
	}
}

export function buildSearchRequest(
	indexName: string,
	request: SearchBooksRequest,
): SearchRequest {
	const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
	const queryText = request.query?.trim();
	const hasQuery = !!queryText;
	const script = queryText ? detectInputScript(queryText) : "kanji";

	// Build the bool query
	const must: QueryDslQueryContainer[] = [];
	if (queryText) {
		must.push(buildTextQuery(queryText, !!request.exactMatch, script));
	}

	const filter = buildFilters(request.filters, request.organizationId);

	const query: QueryDslQueryContainer =
		must.length > 0 || filter.length > 0
			? { bool: { must, filter } }
			: { match_all: {} };

	const sort = buildSort(request.sort, hasQuery);

	const body: SearchRequest = {
		index: indexName,
		query,
		sort,
		size: limit,
		highlight: hasQuery
			? {
					fields: {
						title: {
							type: "unified",
							number_of_fragments: 0,
							pre_tags: ["<em>"],
							post_tags: ["</em>"],
						},
						description: {
							type: "unified",
							number_of_fragments: 1,
							fragment_size: 200,
							pre_tags: ["<em>"],
							post_tags: ["</em>"],
						},
					},
				}
			: undefined,
		_source: true,
	};

	if (request.offset != null) {
		body.from = request.offset;
	} else if (request.cursor) {
		body.search_after = decodeCursor(request.cursor);
	}

	return body;
}

export { encodeCursor };
