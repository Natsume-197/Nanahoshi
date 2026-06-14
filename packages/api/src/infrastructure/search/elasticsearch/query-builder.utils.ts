import type { estypes } from "@elastic/elasticsearch";

type QueryDslQueryContainer = estypes.QueryDslQueryContainer;
type SearchRequest = estypes.SearchRequest;
type Sort = estypes.Sort;

export type InputScript = "kanji" | "kana" | "romaji";

// Regex patterns for Japanese script detection
const KANJI_REGEX = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
const KANA_REGEX = /[\u3040-\u309F\u30A0-\u30FF]/;

export function detectInputScript(query: string): InputScript {
	if (KANJI_REGEX.test(query)) return "kanji";
	if (KANA_REGEX.test(query)) return "kana";
	return "romaji";
}

export function encodeCursor(sortValues: unknown[]): string {
	return Buffer.from(JSON.stringify(sortValues)).toString("base64url");
}

export function decodeCursor(cursor: string): estypes.FieldValue[] {
	return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
}

export type SearchSort =
	| "relevance"
	| "newest"
	| "oldest"
	| "title_asc"
	| "title_desc";

export function buildSort(
	sort: SearchSort | undefined,
	hasQuery: boolean,
): Sort {
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

/**
 * Build a nested Elasticsearch query for a path (e.g. "authors", "narrators").
 * Optionally includes inner_hits with highlighting on the primary name field.
 */
export function buildNestedFieldQuery(
	path: string,
	fields: string[],
	boosts: Record<string, number>,
	effectiveQuery: string,
	includeInnerHits = false,
): QueryDslQueryContainer | null {
	const boostedFields = fields
		.filter((f) => (boosts[f] ?? 0) > 0)
		.map((f) => `${f}^${boosts[f]}`);

	if (boostedFields.length === 0) return null;

	const nested: estypes.QueryDslNestedQuery = {
		path,
		query: {
			simple_query_string: {
				query: effectiveQuery,
				fields: boostedFields,
				default_operator: "and",
				analyze_wildcard: true,
			},
		},
	};

	if (includeInnerHits) {
		nested.inner_hits = {
			_source: false,
			highlight: {
				fields: {
					[`${path}.name`]: {
						type: "unified",
						number_of_fragments: 1,
						pre_tags: ["<em>"],
						post_tags: ["</em>"],
					},
				},
			},
		};
	}

	return { nested };
}

/**
 * Common filter clauses shared between book and audiobook search.
 */
export function buildCommonFilters(
	filters:
		| {
				languageCode?: string[];
				publishedDateRange?: { from?: string; to?: string };
				authors?: string[];
				authorIds?: number[];
				series?: string[];
		  }
		| undefined,
	organizationId?: string,
	accessibleLibraryIds?: number[] | "ALL",
): QueryDslQueryContainer[] {
	const clauses: QueryDslQueryContainer[] = [];

	if (organizationId) {
		clauses.push({ term: { organizationId } });
	}

	// Empty list matches nothing; "ALL"/undefined applies no restriction.
	if (accessibleLibraryIds !== "ALL" && Array.isArray(accessibleLibraryIds)) {
		clauses.push({ terms: { libraryId: accessibleLibraryIds } });
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

	return clauses;
}

/**
 * Build the final SearchRequest body shared between book and audiobook search.
 */
export function buildBaseSearchRequest(opts: {
	indexName: string;
	must: QueryDslQueryContainer[];
	filter: QueryDslQueryContainer[];
	sort: Sort;
	limit: number;
	hasQuery: boolean;
	cursor?: string;
	offset?: number;
}): SearchRequest {
	const { indexName, must, filter, sort, limit, hasQuery, cursor, offset } =
		opts;

	const query: QueryDslQueryContainer =
		must.length > 0 || filter.length > 0
			? { bool: { must, filter } }
			: { match_all: {} };

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

	if (offset != null) {
		body.from = offset;
	} else if (cursor) {
		body.search_after = decodeCursor(cursor);
	}

	return body;
}
