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
	| "title_desc"
	| "rating_desc";

export type RelevanceSortIntent = {
	original: string;
	matchText: string;
	volume: number | null;
};

export type RelevanceSortCandidate = {
	title?: string | null;
	seriesName?: string | null;
	seriesAliases?: string[];
	seriesPosition?: number | null;
	titleVolume?: number | null;
};

const RANK_TIER = {
	exactTitle: 6_000_000,
	titleVolume: 5_000_000,
	seriesPosition: 4_000_000,
	strippedExactTitle: 3_500_000,
	exactSeries: 3_000_000,
	titlePrefix: 2_000_000,
	seriesPrefix: 1_000_000,
} as const;

const MISSING_POSITION = 999_999;

function normalized(value: string | null | undefined): string {
	return value?.toLowerCase() ?? "";
}

function boundedPosition(value: number | null | undefined): number {
	return value == null || !Number.isFinite(value)
		? MISSING_POSITION
		: Math.min(Math.max(value, 0), MISSING_POSITION);
}

/**
 * Reference implementation of the conditional rank tiers used by the
 * Elasticsearch Painless sort below. Kept executable for before/after ranking
 * evaluation without requiring a live Elasticsearch instance.
 */
export function computeRelevanceSortKey(
	candidate: RelevanceSortCandidate,
	intent: RelevanceSortIntent,
): number {
	const original = normalized(intent.original);
	const matchText = normalized(intent.matchText);
	const title = normalized(candidate.title);
	const seriesName = normalized(candidate.seriesName);
	const aliases = (candidate.seriesAliases ?? []).map(normalized);
	const position = boundedPosition(candidate.seriesPosition);
	const seriesExact =
		seriesName === matchText || aliases.some((alias) => alias === matchText);
	const seriesPrefix =
		seriesName.startsWith(matchText) ||
		aliases.some((alias) => alias.startsWith(matchText));
	const titleRelated = title.startsWith(matchText);
	const isRelated = titleRelated || seriesExact || seriesPrefix;

	if (title === original) return RANK_TIER.exactTitle;
	if (
		intent.volume != null &&
		isRelated &&
		candidate.titleVolume === intent.volume
	) {
		return RANK_TIER.titleVolume;
	}
	if (
		intent.volume != null &&
		isRelated &&
		candidate.seriesPosition === intent.volume
	) {
		return RANK_TIER.seriesPosition;
	}
	if (matchText !== original && title === matchText) {
		return RANK_TIER.strippedExactTitle;
	}
	if (seriesExact) return RANK_TIER.exactSeries - position;
	if (title.startsWith(original) || title.startsWith(matchText)) {
		return RANK_TIER.titlePrefix;
	}
	if (seriesPrefix) return RANK_TIER.seriesPrefix;
	return 0;
}

const CONDITIONAL_RELEVANCE_SORT_SOURCE = `
	String original = params.original;
	String matchText = params.matchText;
	String title = doc['title.keyword'].size() == 0
		? '' : doc['title.keyword'].value.toLowerCase();
	String seriesName = doc['series.name.keyword'].size() == 0
		? '' : doc['series.name.keyword'].value.toLowerCase();
	boolean seriesExact = seriesName.equals(matchText);
	boolean seriesPrefix = seriesName.startsWith(matchText);
	if (!seriesExact) {
		for (def aliasValue : doc['series.aliases.keyword']) {
			String alias = aliasValue.toString().toLowerCase();
			if (alias.equals(matchText)) {
				seriesExact = true;
				seriesPrefix = true;
				break;
			}
			if (alias.startsWith(matchText)) seriesPrefix = true;
		}
	}
	boolean titleRelated = title.startsWith(matchText);
	boolean isRelated = titleRelated || seriesExact || seriesPrefix;
	double position = params.missingPosition;
	if (doc['seriesPosition'].size() != 0) {
		position = Math.min(Math.max(doc['seriesPosition'].value, 0), params.missingPosition);
	}
	if (title.equals(original)) return params.exactTitle;
	if (params.hasVolume && isRelated && doc['titleVolume'].size() != 0
		&& doc['titleVolume'].value == params.volume) return params.titleVolume;
	if (params.hasVolume && isRelated && doc['seriesPosition'].size() != 0
		&& doc['seriesPosition'].value == params.volume) return params.seriesPosition;
	if (!matchText.equals(original) && title.equals(matchText)) {
		return params.strippedExactTitle;
	}
	if (seriesExact) return params.exactSeries - position;
	if (title.startsWith(original) || title.startsWith(matchText)) {
		return params.titlePrefix;
	}
	if (seriesPrefix) return params.seriesPrefix;
	return 0;
`;

function buildConditionalRelevanceSort(intent: RelevanceSortIntent) {
	return {
		_script: {
			type: "number",
			order: "desc",
			script: {
				lang: "painless",
				source: CONDITIONAL_RELEVANCE_SORT_SOURCE,
				params: {
					...RANK_TIER,
					missingPosition: MISSING_POSITION,
					// Normalize query constants once instead of once per matched document.
					original: normalized(intent.original),
					matchText: normalized(intent.matchText),
					hasVolume: intent.volume != null,
					volume: intent.volume ?? 0,
				},
			},
		},
	};
}

export function buildSort(
	sort: SearchSort | undefined,
	hasQuery: boolean,
	relevanceIntent?: RelevanceSortIntent,
): Sort {
	switch (sort) {
		case "newest":
			return [{ createdAt: { order: "desc" } }, { _doc: { order: "asc" } }];
		case "oldest":
			return [{ createdAt: { order: "asc" } }, { _doc: { order: "asc" } }];
		case "rating_desc":
			// unmapped_type keeps this safe on the audiobook index (no rating field).
			return [
				{
					rating: {
						order: "desc",
						missing: "_last",
						unmapped_type: "float",
					},
				},
				{
					ratingCount: {
						order: "desc",
						missing: "_last",
						unmapped_type: "integer",
					},
				},
				{ _doc: { order: "asc" } },
			];
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
					// This key is zero for ordinary matches. It only outranks _score for
					// explicit match tiers; only exact series matches encode ascending
					// position so similarly named series keep their text-score ordering.
					...(relevanceIntent
						? [buildConditionalRelevanceSort(relevanceIntent)]
						: []),
					{ _score: { order: "desc" } },
					{ createdAt: { order: "desc" } },
					{ _doc: { order: "asc" } },
				] as Sort;
			}
			return [{ createdAt: { order: "desc" } }, { _doc: { order: "asc" } }];
	}
}

/**
 * Build a nested Elasticsearch query for a path (e.g. "authors", "narrators").
 */
export function buildNestedFieldQuery(
	path: string,
	fields: string[],
	boosts: Record<string, number>,
	effectiveQuery: string,
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
				authorUuids?: string[];
				series?: string[];
		  }
		| undefined,
	serverId?: string,
	accessibleLibraryIds?: number[] | "ALL",
): QueryDslQueryContainer[] {
	const clauses: QueryDslQueryContainer[] = [];

	if (serverId) {
		clauses.push({ term: { serverId } });
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
	if (filters.authorUuids?.length) {
		clauses.push({
			nested: {
				path: "authors",
				query: {
					terms: { "authors.uuid": filters.authorUuids },
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
	cursor?: string;
	offset?: number;
}): SearchRequest {
	const { indexName, must, filter, sort, limit, cursor, offset } = opts;

	const query: QueryDslQueryContainer =
		must.length > 0 || filter.length > 0
			? { bool: { must, filter } }
			: { match_all: {} };

	const body: SearchRequest = {
		index: indexName,
		query,
		sort,
		size: limit,
		_source: true,
	};

	if (offset != null) {
		body.from = offset;
	} else if (cursor) {
		body.search_after = decodeCursor(cursor);
	}

	return body;
}
