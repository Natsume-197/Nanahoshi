import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import {
	accessibleSql,
	visibleBookSql,
} from "../../../routers/_shared/library-scope";
import { bayesianRatingSql } from "../../../routers/_shared/rating";
import { withSerialScan } from "../../../routers/_shared/serial-scan";
import type { SearchProvider } from "../search.provider";
import type {
	SearchAudiobookFilters,
	SearchAudiobookHit,
	SearchAudiobooksRequest,
	SearchAudiobooksResponse,
	SearchAuthorHit,
	SearchAuthorsRequest,
	SearchAuthorsResponse,
	SearchBookHit,
	SearchBooksRequest,
	SearchBooksResponse,
	SearchFilters,
	SearchSeriesHit,
	SearchSeriesRequest,
	SearchSeriesResponse,
	SearchSort,
} from "../search.types";
import { parseVolumeIntent } from "../volume-intent";

type SeriesSearchRow = {
	id: number;
	uuid: string;
	name: string;
	bookCount: number;
	coverInfo: { cover: string; color: string | null } | null;
	author: { id: number; uuid: string; name: string } | null;
};

type AuthorSearchRow = {
	id: number;
	uuid: string;
	name: string;
	bookCount: number;
};

type SearchAuthorRef = {
	uuid?: string;
	name: string;
	role: string | null;
	provider: string | null;
};

type BookSearchRow = {
	id: string;
	filename: string;
	filesizeKb: number | null;
	uuid: string;
	createdAt: string | null;
	lastModified: string | null;
	title: string | null;
	titleRomaji: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	pageCount: number | null;
	isbn10: string | null;
	isbn13: string | null;
	asin: string | null;
	cover: string | null;
	mainColor: string | null;
	amazonRating: number | null;
	amazonReviewCount: number | null;
	publisher: { uuid?: string | null; name: string | null } | null;
	series: { uuid?: string | null; name: string | null } | null;
	authors: SearchAuthorRef[];
	totalHits?: number | string;
};

type AudiobookSearchRow = {
	id: string;
	filename: string;
	uuid: string;
	createdAt: string | null;
	lastModified: string | null;
	title: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	duration: number | null;
	cover: string | null;
	mainColor: string | null;
	publisher: { uuid?: string | null; name: string | null } | null;
	series: { uuid?: string | null; name: string | null } | null;
	authors: SearchAuthorRef[];
	narrators: { uuid?: string; name: string }[];
	totalHits?: number | string;
};

export class PGroongaProvider implements SearchProvider {
	async initialize(): Promise<void> {
		// PGroonga indexes are created via DB migrations — nothing to do here
	}

	// Runs a `&@~` query with parallelism off — see withSerialScan.
	private async executeSerial(query: SQL) {
		return withSerialScan((tx) => tx.execute(query));
	}

	async indexBook(_book: Record<string, unknown>): Promise<void> {
		// No-op: PGroonga searches the live DB directly
	}

	async indexBooksBulk(
		_books: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return { indexed: 0, errors: 0 };
	}

	async deleteBook(_id: string): Promise<void> {
		// No-op
	}

	async deleteByQuery(_query: Record<string, unknown>): Promise<number> {
		return 0;
	}

	async indexSeries(_series: Record<string, unknown>): Promise<void> {
		// No-op
	}

	async indexSeriesBulk(
		_series: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return { indexed: 0, errors: 0 };
	}

	async deleteSeries(_id: string): Promise<void> {
		// No-op
	}

	async deleteSeriesByQuery(_query: Record<string, unknown>): Promise<number> {
		return 0;
	}

	async indexAuthor(_author: Record<string, unknown>): Promise<void> {
		// No-op
	}

	async indexAuthorsBulk(
		_authors: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return { indexed: 0, errors: 0 };
	}

	async deleteAuthor(_id: string): Promise<void> {
		// No-op
	}

	async deleteAuthorsByQuery(_query: Record<string, unknown>): Promise<number> {
		return 0;
	}

	async indexAudiobook(_audiobook: Record<string, unknown>): Promise<void> {
		// No-op
	}

	async indexAudiobooksBulk(
		_audiobooks: Record<string, unknown>[],
	): Promise<{ indexed: number; errors: number }> {
		return { indexed: 0, errors: 0 };
	}

	async deleteAudiobook(_id: string): Promise<void> {
		// No-op
	}

	async deleteAudiobooksByQuery(
		_query: Record<string, unknown>,
	): Promise<number> {
		return 0;
	}

	async searchSeries(
		request: SearchSeriesRequest,
	): Promise<SearchSeriesResponse> {
		const limit = Math.min(Math.max(request.limit ?? 5, 1), 50);
		const offset = Math.max(request.offset ?? 0, 0);
		const queryText = request.query?.trim();
		if (!queryText) return { series: [] };

		const orgCondition = request.serverId
			? sql`AND l.server_id = ${request.serverId}`
			: sql``;
		const seriesOrgCondition = request.serverId
			? sql`AND server_id = ${request.serverId}`
			: sql``;
		const coverOrgCondition = request.serverId
			? sql`AND l2.server_id = ${request.serverId}`
			: sql``;
		const authorOrgCondition = request.serverId
			? sql`AND l3.server_id = ${request.serverId}`
			: sql``;
		const eligibilityOrgCondition = request.serverId
			? sql`AND l4.server_id = ${request.serverId}`
			: sql``;
		const seriesEligibility = Array.isArray(request.accessibleLibraryIds)
			? sql`(
				SELECT COUNT(*)
				FROM book_series bs4
				INNER JOIN book b4 ON b4.id = bs4.book_id
				INNER JOIN library l4 ON l4.id = b4.library_id
				WHERE bs4.series_id = s.id
					AND ${visibleBookSql("b4")}
					${eligibilityOrgCondition}
			) > 1`
			: sql`COUNT(*) > 1`;

		const baseQuery = sql`
			SELECT
				s.id,
				s.uuid,
				s.name,
				COUNT(*)::int AS "bookCount",
				(
					SELECT jsonb_build_object('cover', bm2.cover, 'color', bm2.main_color)
					FROM book_series bs2
					INNER JOIN book b2 ON b2.id = bs2.book_id
					INNER JOIN book_metadata bm2 ON bm2.book_id = b2.id
					INNER JOIN library l2 ON l2.id = b2.library_id
						WHERE bs2.series_id = s.id
							AND bm2.cover IS NOT NULL
							AND ${visibleBookSql("b2")}
							${coverOrgCondition}
							${accessibleSql(request.accessibleLibraryIds, "b2")}
					ORDER BY bs2.position ASC NULLS LAST
					LIMIT 1
				) AS "coverInfo",
				(
					SELECT jsonb_build_object('uuid', a.uuid, 'name', a.name)
					FROM book_series bs3
					INNER JOIN book b3 ON b3.id = bs3.book_id
					INNER JOIN library l3 ON l3.id = b3.library_id
					INNER JOIN book_author ba ON ba.book_id = b3.id
					INNER JOIN author a ON a.id = ba.author_id
						WHERE bs3.series_id = s.id
							AND ${visibleBookSql("b3")}
							${authorOrgCondition}
							${accessibleSql(request.accessibleLibraryIds, "b3")}
					GROUP BY a.id, a.name
					ORDER BY COUNT(*) DESC, a.name ASC
					LIMIT 1
				) AS author
			FROM series s
			INNER JOIN matched_series ms ON ms.id = s.id
			INNER JOIN book_series bs ON bs.series_id = s.id
			INNER JOIN book b ON b.id = bs.book_id
			INNER JOIN library l ON l.id = b.library_id
		`;
		// Exact and prefix matches surface first so the best candidate always
		// fits inside the LIMIT (downstream re-ranking can't rescue what's cut).
		const groupOrder = sql`
			GROUP BY s.id, ms.match_rank
			HAVING ${seriesEligibility}
			ORDER BY
				(lower(s.name) = lower(${queryText}))::int DESC,
				(s.name ILIKE ${`${queryText}%`})::int DESC,
				(EXISTS (
					SELECT 1 FROM unnest(s.aliases) alias
					WHERE lower(alias) = lower(${queryText})
				))::int DESC,
				(EXISTS (
					SELECT 1 FROM unnest(s.aliases) alias
					WHERE alias ILIKE ${`${queryText}%`}
				))::int DESC,
				ms.match_rank DESC,
				s.name ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`;

		// PGroonga full-text search (handles Japanese tokenization)
		const result = await this.executeSerial(sql`
			WITH matched_series AS (
				SELECT id, MAX(match_rank)::int AS match_rank
				FROM (
					SELECT id, 2 AS match_rank FROM series
					WHERE name &@~ ${queryText} ${seriesOrgCondition}
					UNION ALL
					SELECT id, 1 AS match_rank FROM series
					WHERE aliases &@~ ${queryText} ${seriesOrgCondition}
				) matches
				GROUP BY id
			)
			${baseQuery}
				WHERE ${visibleBookSql("b")} ${orgCondition}
				${accessibleSql(request.accessibleLibraryIds)}
				${groupOrder}
		`);

		// Fallback to ILIKE for substring matches (e.g. "la" → "lala")
		const rows = (
			result.rows.length > 0
				? result.rows
				: (
						await this.executeSerial(sql`
			WITH matched_series AS (
				SELECT id, MAX(match_rank)::int AS match_rank
				FROM (
					SELECT id, 2 AS match_rank
					FROM series
					WHERE name ILIKE ${`%${queryText}%`} ${seriesOrgCondition}
					UNION ALL
					SELECT id, 1 AS match_rank
					FROM series
					WHERE EXISTS (
						SELECT 1 FROM unnest(aliases) alias
						WHERE alias ILIKE ${`%${queryText}%`}
					) ${seriesOrgCondition}
				) matches
				GROUP BY id
			)
			${baseQuery}
				WHERE ${visibleBookSql("b")} ${orgCondition}
				${accessibleSql(request.accessibleLibraryIds)}
				${groupOrder}
		`)
					).rows
		) as SeriesSearchRow[];

		const series: SearchSeriesHit[] = rows.map((row) => ({
			uuid: row.uuid,
			name: row.name,
			bookCount: row.bookCount,
			cover: row.coverInfo?.cover ?? null,
			coverColor: row.coverInfo?.color ?? null,
			author: row.author
				? { uuid: row.author.uuid, name: row.author.name }
				: null,
		}));

		return { series };
	}

	async searchAuthors(
		request: SearchAuthorsRequest,
	): Promise<SearchAuthorsResponse> {
		const limit = Math.min(Math.max(request.limit ?? 5, 1), 10);
		const queryText = request.query?.trim();
		if (!queryText) return { authors: [] };

		const orgCondition = request.serverId
			? sql`AND l.server_id = ${request.serverId}`
			: sql``;

		const baseQuery = sql`
			SELECT
				a.id,
				a.uuid,
				a.name,
				COUNT(*)::int AS "bookCount"
			FROM author a
			INNER JOIN (
				SELECT ba.author_id, ba.book_id FROM book_author ba
				UNION ALL
				SELECT aa.author_id, aa.book_id FROM audiobook_author aa
			) combined ON combined.author_id = a.id
			INNER JOIN book b ON b.id = combined.book_id
			INNER JOIN library l ON l.id = b.library_id
		`;
		const groupOrder = sql`
			GROUP BY a.id
			ORDER BY
				(lower(a.name) = lower(${queryText}))::int DESC,
				(a.name ILIKE ${`${queryText}%`})::int DESC,
				a.name ASC
			LIMIT ${limit}
		`;

		// PGroonga full-text search (handles Japanese tokenization)
		const result = await this.executeSerial(sql`
			${baseQuery}
				WHERE a.name &@~ ${queryText} AND ${visibleBookSql("b")} ${orgCondition}
				${accessibleSql(request.accessibleLibraryIds)}
				${groupOrder}
		`);

		// Fallback to ILIKE for substring matches (e.g. "la" → "lala")
		const rows = (
			result.rows.length > 0
				? result.rows
				: (
						await this.executeSerial(sql`
			${baseQuery}
				WHERE a.name ILIKE ${`%${queryText}%`} AND ${visibleBookSql("b")} ${orgCondition}
				${accessibleSql(request.accessibleLibraryIds)}
				${groupOrder}
		`)
					).rows
		) as AuthorSearchRow[];

		const authors: SearchAuthorHit[] = rows.map((row) => ({
			uuid: row.uuid,
			name: row.name,
			bookCount: row.bookCount,
		}));

		return { authors };
	}

	async searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse> {
		const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
		const queryText = request.query?.trim();
		const hasQuery = !!queryText;
		const isRelevance = !request.sort || request.sort === "relevance";
		const intent =
			hasQuery && !request.exactMatch
				? parseVolumeIntent(queryText)
				: { text: queryText ?? "", volume: null };
		const matchText = intent.text || queryText || "";

		const conditions: SQL[] = [
			sql`l.media_type = 'ebook'`,
			sql`b.duplicate_of_book_id IS NULL`,
		];

		if (request.serverId) {
			conditions.push(sql`l.server_id = ${request.serverId}`);
		}

		const scope = request.accessibleLibraryIds;
		if (scope !== "ALL" && Array.isArray(scope)) {
			conditions.push(
				scope.length === 0
					? sql`false`
					: sql`b.library_id IN (${sql.join(
							scope.map((id) => sql`${id}`),
							sql`, `,
						)})`,
			);
		}

		let needsMetadata = false;
		if (request.filters) {
			const built = this.buildBookFilters(request.filters);
			conditions.push(...built.conditions);
			needsMetadata = built.needsMetadata;
		}

		const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;
		const seriesOrgCondition = request.serverId
			? sql`AND server_id = ${request.serverId}`
			: sql``;

		const offset =
			request.offset != null
				? request.offset
				: request.cursor
					? Number.parseInt(
							Buffer.from(request.cursor, "base64url").toString("utf-8"),
							10,
						)
					: 0;

		// Candidate selection and hydration are separate stages: `page` ranks ids
		// over the minimal joins (book/library/metadata), then only the page's
		// rows get publisher/series/authors decorated — the jsonb aggregation over
		// every match was the dominant cost at 40k books.
		const hydrateColumns = sql`
			b.id::text AS id, b.filename, b.filesize_kb AS "filesizeKb", b.uuid,
			b.created_at AS "createdAt", b.last_modified AS "lastModified",
			bm.title, bm.title_romaji AS "titleRomaji", bm.subtitle, bm.description,
			bm.published_date AS "publishedDate", bm.language_code AS "languageCode",
			bm.page_count AS "pageCount", bm.isbn_10 AS "isbn10", bm.isbn_13 AS "isbn13",
			bm.asin, bm.cover, bm.main_color AS "mainColor",
			bm.amazon_rating AS "amazonRating", bm.amazon_review_count AS "amazonReviewCount",
			(
				SELECT jsonb_build_object('uuid', p.uuid, 'name', p.name)
				FROM publisher p
				WHERE p.id = bm.publisher_id
			) AS publisher,
			(
				SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name)
				FROM book_series bs
				INNER JOIN series s ON s.id = bs.series_id
				WHERE bs.book_id = b.id
				ORDER BY bs.position ASC NULLS LAST
				LIMIT 1
			) AS series,
			(
				SELECT COALESCE(
					jsonb_agg(jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', ba.role, 'provider', a.provider) ORDER BY a.name),
					'[]'
				)
				FROM book_author ba
				INNER JOIN author a ON a.id = ba.author_id
				WHERE ba.book_id = b.id
			) AS authors`;

		// Match resolution runs in the `hits` CTE so every `&@~` lands on its own
		// PGroonga index (BitmapOr): a single OR spanning book_metadata AND author
		// forces a full-catalog join + row-by-row match instead. Each match source
		// carries a field weight (mirroring the Elasticsearch boosts) so a title
		// hit always outranks a description-only hit.
		const orderKeys = this.buildOrderKeys(
			request.sort,
			"bm",
			request.serverId,
			hasQuery
				? { original: queryText ?? "", matchText, volume: intent.volume }
				: undefined,
		);
		const seriesLateral =
			hasQuery && isRelevance ? this.buildSeriesLateral("book_series") : sql``;
		const mainResult = hasQuery
			? await this.executeSerial(sql`
				WITH field_hits AS (
					SELECT bm2.book_id, pgroonga_score(bm2.tableoid, bm2.ctid) * 10 AS score
					FROM book_metadata bm2 WHERE bm2.title &@~ ${matchText}
					UNION ALL
					SELECT bm2.book_id, pgroonga_score(bm2.tableoid, bm2.ctid) * 5
					FROM book_metadata bm2 WHERE bm2.title_romaji &@~ ${matchText}
					UNION ALL
					SELECT bm2.book_id, pgroonga_score(bm2.tableoid, bm2.ctid) * 3
					FROM book_metadata bm2 WHERE bm2.subtitle &@~ ${matchText}
					UNION ALL
					SELECT bm2.book_id, pgroonga_score(bm2.tableoid, bm2.ctid) * 2
					FROM book_metadata bm2 WHERE bm2.description &@~ ${matchText}
				), author_hits AS (
					SELECT ba2.book_id, pgroonga_score(a2.tableoid, a2.ctid) * 8 AS score
					FROM book_author ba2
					INNER JOIN author a2 ON a2.id = ba2.author_id
					WHERE a2.name &@~ ${matchText}
				), series_matches AS (
					SELECT id, MAX(score) AS score
					FROM (
						SELECT id, pgroonga_score(tableoid, ctid) * 7 AS score FROM series
						WHERE name &@~ ${matchText} ${seriesOrgCondition}
						UNION ALL
						SELECT id, pgroonga_score(tableoid, ctid) * 5 FROM series
						WHERE aliases &@~ ${matchText} ${seriesOrgCondition}
					) sm
					GROUP BY id
				), series_hits AS (
					SELECT bs2.book_id, sm.score
					FROM book_series bs2
					INNER JOIN series_matches sm ON sm.id = bs2.series_id
				), hits AS (
					SELECT book_id, MAX(score) AS score
					FROM (
						SELECT * FROM field_hits
						UNION ALL SELECT * FROM author_hits
						UNION ALL SELECT * FROM series_hits
					) matched
					GROUP BY book_id
				), page AS (
					SELECT b.id AS book_id,
						row_number() OVER (ORDER BY ${orderKeys}) AS rn
					FROM hits h
					INNER JOIN book b ON b.id = h.book_id
					INNER JOIN library l ON l.id = b.library_id
					LEFT JOIN book_metadata bm ON bm.book_id = b.id
					${seriesLateral}
					${whereClause}
					ORDER BY ${orderKeys}
					LIMIT ${limit + 1} OFFSET ${offset}
				)
				SELECT ${hydrateColumns}
				FROM page pg
				INNER JOIN book b ON b.id = pg.book_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				ORDER BY pg.rn ASC
			`)
			: await db.execute(sql`
				WITH page AS (
					SELECT b.id AS book_id,
						row_number() OVER (ORDER BY ${orderKeys}) AS rn
					FROM book b
					INNER JOIN library l ON l.id = b.library_id
					LEFT JOIN book_metadata bm ON bm.book_id = b.id
					${whereClause}
					ORDER BY ${orderKeys}
					LIMIT ${limit} OFFSET ${offset}
				), total AS (
					SELECT count(*)::bigint AS count
					FROM book b
					INNER JOIN library l ON l.id = b.library_id
					${needsMetadata ? sql`LEFT JOIN book_metadata bm ON bm.book_id = b.id` : sql``}
					${whereClause}
				)
				SELECT ${hydrateColumns}, (SELECT count FROM total) AS "totalHits"
				FROM page pg
				INNER JOIN book b ON b.id = pg.book_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				ORDER BY pg.rn ASC
			`);

		return this.mapBookResults(
			mainResult.rows as BookSearchRow[],
			hasQuery,
			offset,
			limit,
		);
	}

	async searchAudiobooks(
		request: SearchAudiobooksRequest,
	): Promise<SearchAudiobooksResponse> {
		const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
		const queryText = request.query?.trim();
		const hasQuery = !!queryText;
		const isRelevance = !request.sort || request.sort === "relevance";
		const intent =
			hasQuery && !request.exactMatch
				? parseVolumeIntent(queryText)
				: { text: queryText ?? "", volume: null };
		const matchText = intent.text || queryText || "";

		const conditions: SQL[] = [sql`l.media_type = 'audiobook'`];

		if (request.serverId) {
			conditions.push(sql`l.server_id = ${request.serverId}`);
		}

		const audiobookScope = request.accessibleLibraryIds;
		if (audiobookScope !== "ALL" && Array.isArray(audiobookScope)) {
			conditions.push(
				audiobookScope.length === 0
					? sql`false`
					: sql`b.library_id IN (${sql.join(
							audiobookScope.map((id) => sql`${id}`),
							sql`, `,
						)})`,
			);
		}

		let needsMetadata = false;
		if (request.filters) {
			const built = this.buildAudiobookFilters(request.filters);
			conditions.push(...built.conditions);
			needsMetadata = built.needsMetadata;
		}

		const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;
		const seriesOrgCondition = request.serverId
			? sql`AND server_id = ${request.serverId}`
			: sql``;

		const offset =
			request.offset != null
				? request.offset
				: request.cursor
					? Number.parseInt(
							Buffer.from(request.cursor, "base64url").toString("utf-8"),
							10,
						)
					: 0;

		// Same two-stage shape as searchBooks: rank ids in `page`, hydrate only
		// the page's rows.
		const hydrateColumns = sql`
			b.id::text AS id, b.filename, b.uuid,
			b.created_at AS "createdAt", b.last_modified AS "lastModified",
			am.title, am.subtitle, am.description,
			am.published_date AS "publishedDate", am.language_code AS "languageCode",
			am.duration, am.cover, am.main_color AS "mainColor",
			(
				SELECT jsonb_build_object('uuid', p.uuid, 'name', p.name)
				FROM publisher p
				WHERE p.id = am.publisher_id
			) AS publisher,
			(
				SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name)
				FROM audiobook_series abs
				INNER JOIN series s ON s.id = abs.series_id
				WHERE abs.book_id = b.id
				ORDER BY abs.position ASC NULLS LAST
				LIMIT 1
			) AS series,
			(
				SELECT COALESCE(
					jsonb_agg(jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', aa.role, 'provider', a.provider) ORDER BY a.name),
					'[]'
				)
				FROM audiobook_author aa
				INNER JOIN author a ON a.id = aa.author_id
				WHERE aa.book_id = b.id
			) AS authors,
			(
				SELECT COALESCE(
					jsonb_agg(jsonb_build_object('uuid', n.uuid, 'name', n.name) ORDER BY n.name),
					'[]'
				)
				FROM book_narrator bn
				INNER JOIN narrator n ON n.id = bn.narrator_id
				WHERE bn.book_id = b.id
			) AS narrators`;

		// Same hits-CTE shape as searchBooks: each `&@~` on its own PGroonga index,
		// weighted per field.
		const orderKeys = this.buildOrderKeys(
			request.sort,
			"am",
			undefined,
			hasQuery
				? { original: queryText ?? "", matchText, volume: intent.volume }
				: undefined,
		);
		const seriesLateral =
			hasQuery && isRelevance
				? this.buildSeriesLateral("audiobook_series")
				: sql``;
		const mainResult = hasQuery
			? await this.executeSerial(sql`
				WITH field_hits AS (
					SELECT am2.book_id, pgroonga_score(am2.tableoid, am2.ctid) * 10 AS score
					FROM audiobook_metadata am2 WHERE am2.title &@~ ${matchText}
					UNION ALL
					SELECT am2.book_id, pgroonga_score(am2.tableoid, am2.ctid) * 3
					FROM audiobook_metadata am2 WHERE am2.subtitle &@~ ${matchText}
					UNION ALL
					SELECT am2.book_id, pgroonga_score(am2.tableoid, am2.ctid) * 2
					FROM audiobook_metadata am2 WHERE am2.description &@~ ${matchText}
				), author_hits AS (
					SELECT aa2.book_id, pgroonga_score(a2.tableoid, a2.ctid) * 8 AS score
					FROM audiobook_author aa2
					INNER JOIN author a2 ON a2.id = aa2.author_id
					WHERE a2.name &@~ ${matchText}
				), narrator_hits AS (
					SELECT bn2.book_id, pgroonga_score(n2.tableoid, n2.ctid) * 6 AS score
					FROM book_narrator bn2
					INNER JOIN narrator n2 ON n2.id = bn2.narrator_id
					WHERE n2.name &@~ ${matchText}
				), series_matches AS (
					SELECT id, MAX(score) AS score
					FROM (
						SELECT id, pgroonga_score(tableoid, ctid) * 7 AS score FROM series
						WHERE name &@~ ${matchText} ${seriesOrgCondition}
						UNION ALL
						SELECT id, pgroonga_score(tableoid, ctid) * 5 FROM series
						WHERE aliases &@~ ${matchText} ${seriesOrgCondition}
					) sm
					GROUP BY id
				), series_hits AS (
					SELECT abs2.book_id, sm.score
					FROM audiobook_series abs2
					INNER JOIN series_matches sm ON sm.id = abs2.series_id
				), hits AS (
					SELECT book_id, MAX(score) AS score
					FROM (
						SELECT * FROM field_hits
						UNION ALL SELECT * FROM author_hits
						UNION ALL SELECT * FROM narrator_hits
						UNION ALL SELECT * FROM series_hits
					) matched
					GROUP BY book_id
				), page AS (
					SELECT b.id AS book_id,
						row_number() OVER (ORDER BY ${orderKeys}) AS rn
					FROM hits h
					INNER JOIN book b ON b.id = h.book_id
					INNER JOIN library l ON l.id = b.library_id
					LEFT JOIN audiobook_metadata am ON am.book_id = b.id
					${seriesLateral}
					${whereClause}
					ORDER BY ${orderKeys}
					LIMIT ${limit + 1} OFFSET ${offset}
				)
				SELECT ${hydrateColumns}
				FROM page pg
				INNER JOIN book b ON b.id = pg.book_id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				ORDER BY pg.rn ASC
			`)
			: await db.execute(sql`
				WITH page AS (
					SELECT b.id AS book_id,
						row_number() OVER (ORDER BY ${orderKeys}) AS rn
					FROM book b
					INNER JOIN library l ON l.id = b.library_id
					LEFT JOIN audiobook_metadata am ON am.book_id = b.id
					${whereClause}
					ORDER BY ${orderKeys}
					LIMIT ${limit} OFFSET ${offset}
				), total AS (
					SELECT count(*)::bigint AS count
					FROM book b
					INNER JOIN library l ON l.id = b.library_id
					${needsMetadata ? sql`LEFT JOIN audiobook_metadata am ON am.book_id = b.id` : sql``}
					${whereClause}
				)
				SELECT ${hydrateColumns}, (SELECT count FROM total) AS "totalHits"
				FROM page pg
				INNER JOIN book b ON b.id = pg.book_id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				ORDER BY pg.rn ASC
			`);

		const rows = mainResult.rows as AudiobookSearchRow[];
		// Same limit+1 probing as mapBookResults: text queries trade the exact
		// total for a lower bound so Postgres never materializes the full match set.
		const hasMore = hasQuery
			? rows.length > limit
			: offset + limit < Number(rows[0]?.totalHits ?? 0);
		const pageRows = hasQuery ? rows.slice(0, limit) : rows;
		const totalHits = hasQuery
			? offset + rows.length
			: Number(rows[0]?.totalHits ?? 0);

		const audiobooks: SearchAudiobookHit[] = pageRows.map((row) => {
			const { totalHits: _totalHits, id: _id, ...source } = row;
			return {
				...source,
				createdAt: source.createdAt
					? new Date(source.createdAt).toISOString()
					: null,
				lastModified: source.lastModified
					? new Date(source.lastModified).toISOString()
					: null,
				publisher: source.publisher?.name != null ? source.publisher : null,
				series: source.series?.name != null ? source.series : null,
			} as unknown as SearchAudiobookHit;
		});

		let cursor: string | undefined;
		if (hasMore) {
			cursor = Buffer.from(String(offset + limit)).toString("base64url");
		}

		return {
			audiobooks,
			pagination: {
				cursor,
				hasMore,
				totalHits,
				totalHitsRelation: hasQuery && hasMore ? "gte" : "eq",
			},
		};
	}

	async getIndexedCount(): Promise<number> {
		const result = await db.execute(
			sql`SELECT COUNT(*)::int AS count FROM book`,
		);
		const row = result.rows[0] as { count: number } | undefined;
		return Number(row?.count ?? 0);
	}

	requiresSync(): boolean {
		return false;
	}

	private mapBookResults(
		rows: BookSearchRow[],
		hasQuery: boolean,
		offset: number,
		limit: number,
	): SearchBooksResponse {
		// Text queries skip the exact count(*) OVER() (it materializes every
		// match): a limit+1 probe row answers hasMore, and totalHits is a lower
		// bound ("gte") until the last page makes it exact.
		const hasMore = hasQuery
			? rows.length > limit
			: offset + limit < Number(rows[0]?.totalHits ?? 0);
		const pageRows = hasQuery ? rows.slice(0, limit) : rows;
		const totalHits = hasQuery
			? offset + rows.length
			: Number(rows[0]?.totalHits ?? 0);

		const books: SearchBookHit[] = pageRows.map((row) => {
			const { totalHits: _totalHits, id: _id, ...publicSource } = row;
			return {
				...publicSource,
				createdAt: publicSource.createdAt
					? new Date(publicSource.createdAt).toISOString()
					: null,
				lastModified: publicSource.lastModified
					? new Date(publicSource.lastModified).toISOString()
					: null,
				publisher:
					publicSource.publisher?.name != null ? publicSource.publisher : null,
				series: publicSource.series?.name != null ? publicSource.series : null,
			} as unknown as SearchBookHit;
		});

		let cursor: string | undefined;
		if (hasMore) {
			cursor = Buffer.from(String(offset + limit)).toString("base64url");
		}

		return {
			books,
			pagination: {
				cursor,
				hasMore,
				totalHits,
				totalHitsRelation: hasQuery && hasMore ? "gte" : "eq",
			},
		};
	}

	// Drizzle expands an array param inside sql`` to a record `($1, $2)`, so
	// `col = ANY(${arr})` is a runtime error — build a real array literal instead.
	private anyOf(column: SQL, values: string[], cast = "text"): SQL {
		const items = sql.join(
			values.map((v) => sql`${v}`),
			sql`, `,
		);
		return sql`${column} = ANY(ARRAY[${items}]::${sql.raw(cast)}[])`;
	}

	// Filter conditions may only reference `b` and the metadata alias (`bm`/`am`)
	// — the page/total CTEs don't join authors/series/publishers, so relation
	// filters go through EXISTS. `needsMetadata` tells the count query whether
	// the metadata join can be skipped.
	private buildBookFilters(filters: SearchFilters): {
		conditions: SQL[];
		needsMetadata: boolean;
	} {
		const conditions: SQL[] = [];
		let needsMetadata = false;

		if (filters.languageCode?.length) {
			conditions.push(this.anyOf(sql`bm.language_code`, filters.languageCode));
			needsMetadata = true;
		}
		if (filters.publishedDateRange?.from) {
			conditions.push(
				sql`bm.published_date >= ${filters.publishedDateRange.from}`,
			);
			needsMetadata = true;
		}
		if (filters.publishedDateRange?.to) {
			conditions.push(
				sql`bm.published_date <= ${filters.publishedDateRange.to}`,
			);
			needsMetadata = true;
		}
		if (filters.pageCountRange?.min != null) {
			conditions.push(sql`bm.page_count >= ${filters.pageCountRange.min}`);
			needsMetadata = true;
		}
		if (filters.pageCountRange?.max != null) {
			conditions.push(sql`bm.page_count <= ${filters.pageCountRange.max}`);
			needsMetadata = true;
		}
		if (filters.authors?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM book_author baf
				INNER JOIN author af ON af.id = baf.author_id
				WHERE baf.book_id = b.id AND ${this.anyOf(sql`af.name`, filters.authors)}
			)`);
		}
		if (filters.authorUuids?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM book_author baf
				INNER JOIN author af ON af.id = baf.author_id
				WHERE baf.book_id = b.id AND ${this.anyOf(sql`af.uuid`, filters.authorUuids, "uuid")}
			)`);
		}
		if (filters.series?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM book_series bsf
				INNER JOIN series sf ON sf.id = bsf.series_id
				WHERE bsf.book_id = b.id AND ${this.anyOf(sql`sf.name`, filters.series)}
			)`);
		}
		if (filters.publishers?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM publisher pf
				WHERE pf.id = bm.publisher_id AND ${this.anyOf(sql`pf.name`, filters.publishers)}
			)`);
			needsMetadata = true;
		}
		if (filters.minRating != null) {
			conditions.push(sql`bm.amazon_rating >= ${filters.minRating}`);
			needsMetadata = true;
		}
		return { conditions, needsMetadata };
	}

	private buildAudiobookFilters(filters: SearchAudiobookFilters): {
		conditions: SQL[];
		needsMetadata: boolean;
	} {
		const conditions: SQL[] = [];
		let needsMetadata = false;

		if (filters.languageCode?.length) {
			conditions.push(this.anyOf(sql`am.language_code`, filters.languageCode));
			needsMetadata = true;
		}
		if (filters.publishedDateRange?.from) {
			conditions.push(
				sql`am.published_date >= ${filters.publishedDateRange.from}`,
			);
			needsMetadata = true;
		}
		if (filters.publishedDateRange?.to) {
			conditions.push(
				sql`am.published_date <= ${filters.publishedDateRange.to}`,
			);
			needsMetadata = true;
		}
		if (filters.authors?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM audiobook_author aaf
				INNER JOIN author af ON af.id = aaf.author_id
				WHERE aaf.book_id = b.id AND ${this.anyOf(sql`af.name`, filters.authors)}
			)`);
		}
		if (filters.authorUuids?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM audiobook_author aaf
				INNER JOIN author af ON af.id = aaf.author_id
				WHERE aaf.book_id = b.id AND ${this.anyOf(sql`af.uuid`, filters.authorUuids, "uuid")}
			)`);
		}
		if (filters.narrators?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM book_narrator bnf
				INNER JOIN narrator nf ON nf.id = bnf.narrator_id
				WHERE bnf.book_id = b.id AND ${this.anyOf(sql`nf.name`, filters.narrators)}
			)`);
		}
		if (filters.narratorUuids?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM book_narrator bnf
				INNER JOIN narrator nf ON nf.id = bnf.narrator_id
				WHERE bnf.book_id = b.id AND ${this.anyOf(sql`nf.uuid`, filters.narratorUuids, "uuid")}
			)`);
		}
		if (filters.series?.length) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM audiobook_series asf
				INNER JOIN series sf ON sf.id = asf.series_id
				WHERE asf.book_id = b.id AND ${this.anyOf(sql`sf.name`, filters.series)}
			)`);
		}
		return { conditions, needsMetadata };
	}

	// First-position row (by position, NULLS LAST) of the book's series, plus
	// whether that series has an explicit volume 1 — needed to decide where
	// unnumbered entries sort (see buildRelevanceKeys).
	private buildSeriesLateral(
		linkTable: "book_series" | "audiobook_series",
	): SQL {
		const link = sql.raw(linkTable);
		return sql`
			LEFT JOIN LATERAL (
				SELECT bsl.series_id, bsl.position,
					s.name AS series_name, s.aliases AS series_aliases,
					EXISTS (
						SELECT 1 FROM ${link} bsv
						WHERE bsv.series_id = bsl.series_id AND bsv.position = 1
					) AS series_has_vol1
				FROM ${link} bsl
				INNER JOIN series s ON s.id = bsl.series_id
				WHERE bsl.book_id = b.id
				ORDER BY bsl.position ASC NULLS LAST
				LIMIT 1
			) sr ON true`;
	}

	// Relevance tiers for text queries: exact title (as typed) → requested
	// volume → exact stripped title → exact series/alias (in volume order) →
	// title prefix → series/alias prefix (in volume order) → weighted score
	// (+rating nudge) → series grouping → volume order → recency.
	//
	// When the SERIES ITSELF matched (exact or prefix), volume order must
	// dominate the score: description mentions and rating nudges vary per
	// volume and would otherwise scramble the series ("konosuba" came out
	// 19, 17, 27, 2…). The conditional CASE keys pin those tiers to
	// (series_id, position) and stay NULL — a no-op — for every other row.
	// Within a series, an unnumbered entry counts as volume 1 only when no
	// explicit volume 1 exists (otherwise it's an extra and sorts last).
	private buildRelevanceKeys(
		metaAlias: "bm" | "am",
		query: { original: string; matchText: string; volume: number | null },
	): SQL {
		const { original, matchText, volume } = query;
		const title = sql.raw(`${metaAlias}.title`);
		const hasRomaji = metaAlias === "bm";
		const stripped = matchText !== original;

		const exactTerms: SQL[] = [sql`lower(${title}) = lower(${original})`];
		const prefixTerms: SQL[] = [sql`${title} ILIKE ${`${original}%`}`];
		if (hasRomaji) {
			exactTerms.push(sql`lower(bm.title_romaji) = lower(${original})`);
			prefixTerms.push(sql`bm.title_romaji ILIKE ${`${original}%`}`);
		}
		if (stripped) {
			prefixTerms.push(sql`${title} ILIKE ${`${matchText}%`}`);
			if (hasRomaji) {
				prefixTerms.push(sql`bm.title_romaji ILIKE ${`${matchText}%`}`);
			}
		}
		// Series aliases commonly vary only in typography ("Re: Zero" versus
		// "re zero"). translate() is cheaper and more predictable here than a
		// regex and keeps punctuation from disabling exact/prefix volume ordering.
		const rankSeparators = " \t\r\n　:：._‐‑‒–—―・";
		const comparable = (value: SQL): SQL =>
			sql`lower(translate(COALESCE(${value}, ''), ${rankSeparators}, ''))`;
		const comparableMatch = comparable(sql`${matchText}`);
		const seriesExact = sql`(${comparable(sql`sr.series_name`)} = ${comparableMatch} OR EXISTS (
			SELECT 1 FROM unnest(COALESCE(sr.series_aliases, '{}'::text[])) alias
			WHERE ${comparable(sql`alias`)} = ${comparableMatch}
		))`;
		const seriesPrefix = sql`(${comparable(sql`sr.series_name`)} LIKE (${comparableMatch} || '%') OR EXISTS (
			SELECT 1 FROM unnest(COALESCE(sr.series_aliases, '{}'::text[])) alias
			WHERE ${comparable(sql`alias`)} LIKE (${comparableMatch} || '%')
		))`;
		const effectivePosition = sql`COALESCE(sr.position, CASE
			WHEN COALESCE(sr.series_has_vol1, false) THEN 'infinity'::float8
			ELSE 0 END)`;

		// Every boolean key goes through IS TRUE: NULL operands (missing romaji,
		// no series row) would otherwise make the whole expression NULL, which
		// DESC sorts ahead of TRUE.
		const boolKey = (terms: SQL[]): SQL =>
			sql`((${sql.join(terms, sql` OR `)}) IS TRUE)::int DESC`;
		const volumeOrderWhen = (condition: SQL): SQL[] => [
			sql`CASE WHEN ${condition} IS TRUE THEN sr.series_id END ASC NULLS LAST`,
			sql`CASE WHEN ${condition} IS TRUE THEN ${effectivePosition} END ASC NULLS LAST`,
		];

		const keys: SQL[] = [boolKey(exactTerms)];
		if (volume != null) {
			// The number printed in the title is the ground truth for "tomo N" —
			// series position can drift (side stories shift later positions, e.g.
			// konosuba's vol 9 sits at position 10). Native title outranks romaji
			// (enrichment sometimes copies a sibling's romaji); position only
			// decides when no title carries the number. When several titles carry
			// the number (merged sub-series like youjitsu 4 / 3年生編4), the
			// shortest — unqualified — title is the canonical pick.
			// Boundaries exclude latin letters too so digit runs embedded in
			// words/codes ("f71ns") never count as a volume number.
			const numberToken = String(volume).replace(".", "\\.");
			const titleNumberPattern = `(^|[^0-9.a-zA-Z])${numberToken}([^0-9.a-zA-Z]|$)`;
			const titleNumberMatch = sql`translate(${title}, '０１２３４５６７８９（）．', '0123456789().') ~ ${titleNumberPattern}`;
			keys.push(boolKey([titleNumberMatch]));
			if (hasRomaji) {
				keys.push(boolKey([sql`bm.title_romaji ~ ${titleNumberPattern}`]));
			}
			keys.push(
				boolKey([
					sql`sr.position = ${volume}::float8`,
					sql`(${volume}::float8 = 1 AND sr.position IS NULL
						AND NOT COALESCE(sr.series_has_vol1, false))`,
				]),
			);
			keys.push(
				sql`CASE WHEN ${titleNumberMatch} THEN length(${title}) END ASC NULLS LAST`,
			);
			const strippedExact: SQL[] = [sql`lower(${title}) = lower(${matchText})`];
			if (hasRomaji) {
				strippedExact.push(sql`lower(bm.title_romaji) = lower(${matchText})`);
			}
			keys.push(boolKey(strippedExact));
		}
		keys.push(boolKey([seriesExact]));
		keys.push(...volumeOrderWhen(seriesExact));
		keys.push(boolKey(prefixTerms));
		keys.push(boolKey([seriesPrefix]));
		keys.push(...volumeOrderWhen(seriesPrefix));
		keys.push(
			metaAlias === "bm"
				? sql`(h.score + ln(1 + 0.5 * COALESCE(bm.amazon_rating, 0))) DESC`
				: sql`h.score DESC`,
		);
		keys.push(sql`sr.series_id ASC NULLS LAST`);
		keys.push(sql`${effectivePosition} ASC`);
		keys.push(sql`b.created_at DESC NULLS LAST`, sql`b.id DESC`);
		return sql.join(keys, sql`, `);
	}

	// Returns the comma-separated sort keys (no ORDER BY prefix): the page CTE
	// uses them both to order/limit and to stamp `row_number()` so hydration
	// can restore the ranking with a plain `ORDER BY pg.rn`.
	private buildOrderKeys(
		sort: SearchSort | undefined,
		metaAlias: "bm" | "am",
		serverId?: string,
		query?: { original: string; matchText: string; volume: number | null },
	): SQL {
		switch (sort) {
			case "newest":
				return sql`b.created_at DESC NULLS LAST, b.id DESC`;
			case "oldest":
				return sql`b.created_at ASC NULLS LAST, b.id ASC`;
			case "title_asc":
				return metaAlias === "bm"
					? sql`bm.title ASC NULLS LAST, b.id ASC`
					: sql`am.title ASC NULLS LAST, b.id ASC`;
			case "title_desc":
				return metaAlias === "bm"
					? sql`bm.title DESC NULLS LAST, b.id DESC`
					: sql`am.title DESC NULLS LAST, b.id DESC`;
			case "rating_desc":
				// Books only (audiobooks carry no rating); rank by the Bayesian score
				// so a few glowing reviews can't beat a broadly-loved book (#4/#5).
				return metaAlias === "bm"
					? sql`${bayesianRatingSql("bm", serverId)} DESC NULLS LAST, b.created_at DESC NULLS LAST, b.id DESC`
					: sql`b.created_at DESC NULLS LAST, b.id DESC`;
			default: {
				if (!query) {
					return sql`b.created_at DESC NULLS LAST, b.id DESC`;
				}
				return this.buildRelevanceKeys(metaAlias, query);
			}
		}
	}
}
