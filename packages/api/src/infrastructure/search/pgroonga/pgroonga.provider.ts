import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../../../routers/_shared/library-scope";
import { bayesianRatingSql } from "../../../routers/_shared/rating";
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
		const coverOrgCondition = request.serverId
			? sql`AND l2.server_id = ${request.serverId}`
			: sql``;
		const authorOrgCondition = request.serverId
			? sql`AND l3.server_id = ${request.serverId}`
			: sql``;

		const baseQuery = sql`
			SELECT
				s.id,
				s.uuid,
				s.name,
				COUNT(DISTINCT b.id)::int AS "bookCount",
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
					GROUP BY a.id, a.name
					ORDER BY COUNT(*) DESC, a.name ASC
					LIMIT 1
				) AS author
			FROM series s
			INNER JOIN book_series bs ON bs.series_id = s.id
			INNER JOIN book b ON b.id = bs.book_id
			INNER JOIN library l ON l.id = b.library_id
		`;
		// Exact and prefix matches surface first so the best candidate always
		// fits inside the LIMIT (downstream re-ranking can't rescue what's cut).
		const groupOrder = sql`
			GROUP BY s.id
			HAVING COUNT(DISTINCT b.id) > 1
			ORDER BY
				(lower(s.name) = lower(${queryText}))::int DESC,
				(s.name ILIKE ${`${queryText}%`})::int DESC,
				s.name ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`;

		// PGroonga full-text search (handles Japanese tokenization)
		const result = await db.execute(sql`
			${baseQuery}
			WHERE s.name &@~ ${queryText} AND ${visibleBookSql("b")} ${orgCondition}
			${groupOrder}
		`);

		// Fallback to ILIKE for substring matches (e.g. "la" → "lala")
		const rows = (
			result.rows.length > 0
				? result.rows
				: (
						await db.execute(sql`
			${baseQuery}
			WHERE s.name ILIKE ${`%${queryText}%`} AND ${visibleBookSql("b")} ${orgCondition}
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
				COUNT(DISTINCT b.id)::int AS "bookCount"
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
		const result = await db.execute(sql`
			${baseQuery}
			WHERE a.name &@~ ${queryText} AND ${visibleBookSql("b")} ${orgCondition}
			${groupOrder}
		`);

		// Fallback to ILIKE for substring matches (e.g. "la" → "lala")
		const rows = (
			result.rows.length > 0
				? result.rows
				: (
						await db.execute(sql`
			${baseQuery}
			WHERE a.name ILIKE ${`%${queryText}%`} AND ${visibleBookSql("b")} ${orgCondition}
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

		if (request.filters) {
			conditions.push(...this.buildBookFilters(request.filters));
		}

		const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

		const offset =
			request.offset != null
				? request.offset
				: request.cursor
					? Number.parseInt(
							Buffer.from(request.cursor, "base64url").toString("utf-8"),
							10,
						)
					: 0;

		const orderBy = this.buildOrderBy(
			request.sort,
			"bm",
			request.serverId,
			queryText,
		);

		// Match resolution runs in the `hits` CTE so every `&@~` lands on its own
		// PGroonga index (BitmapOr): a single OR spanning book_metadata AND author
		// forces a full-catalog join + row-by-row match instead.
		const mainResult = hasQuery
			? await db.execute(sql`
				WITH metadata_hits AS (
					SELECT bm2.book_id, pgroonga_score(bm2.tableoid, bm2.ctid) AS score
					FROM book_metadata bm2
					WHERE bm2.title &@~ ${queryText}
						OR bm2.description &@~ ${queryText}
						OR bm2.subtitle &@~ ${queryText}
						OR bm2.title_romaji &@~ ${queryText}
				), author_hits AS (
					SELECT ba2.book_id, 0::float8 AS score
					FROM book_author ba2
					INNER JOIN author a2 ON a2.id = ba2.author_id
					WHERE a2.name &@~ ${queryText}
				), hits AS (
					SELECT book_id, MAX(score) AS score
					FROM (SELECT * FROM metadata_hits UNION ALL SELECT * FROM author_hits) matched
					GROUP BY book_id
				)
				SELECT
					b.id::text AS id, b.filename, b.filesize_kb AS "filesizeKb", b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					bm.title, bm.title_romaji AS "titleRomaji", bm.subtitle, bm.description,
					bm.published_date AS "publishedDate", bm.language_code AS "languageCode",
					bm.page_count AS "pageCount", bm.isbn_10 AS "isbn10", bm.isbn_13 AS "isbn13",
					bm.asin, bm.cover, bm.main_color AS "mainColor",
					bm.amazon_rating AS "amazonRating", bm.amazon_review_count AS "amazonReviewCount",
					jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
					jsonb_build_object('uuid', s.uuid, 'name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', ba.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors
				FROM book b
				INNER JOIN hits h ON h.book_id = b.id
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				LEFT JOIN book_author ba ON ba.book_id = b.id
				LEFT JOIN author a ON a.id = ba.author_id
				LEFT JOIN publisher p ON p.id = bm.publisher_id
				LEFT JOIN book_series bs ON bs.book_id = b.id
				LEFT JOIN series s ON s.id = bs.series_id
				${whereClause}
				GROUP BY b.id, bm.book_id, p.id, s.id, l.server_id
				${orderBy}
				LIMIT ${limit + 1} OFFSET ${offset}
			`)
			: await db.execute(sql`
				SELECT
					b.id::text AS id, b.filename, b.filesize_kb AS "filesizeKb", b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					bm.title, bm.title_romaji AS "titleRomaji", bm.subtitle, bm.description,
					bm.published_date AS "publishedDate", bm.language_code AS "languageCode",
					bm.page_count AS "pageCount", bm.isbn_10 AS "isbn10", bm.isbn_13 AS "isbn13",
					bm.asin, bm.cover, bm.main_color AS "mainColor",
					bm.amazon_rating AS "amazonRating", bm.amazon_review_count AS "amazonReviewCount",
					jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
					jsonb_build_object('uuid', s.uuid, 'name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', ba.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors,
					count(*) OVER() AS "totalHits"
				FROM book b
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				LEFT JOIN book_author ba ON ba.book_id = b.id
				LEFT JOIN author a ON a.id = ba.author_id
				LEFT JOIN publisher p ON p.id = bm.publisher_id
				LEFT JOIN book_series bs ON bs.book_id = b.id
				LEFT JOIN series s ON s.id = bs.series_id
				${whereClause}
				GROUP BY b.id, bm.book_id, p.id, s.id, l.server_id
				${orderBy}
				LIMIT ${limit} OFFSET ${offset}
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

		if (request.filters) {
			conditions.push(...this.buildAudiobookFilters(request.filters));
		}

		const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

		const offset =
			request.offset != null
				? request.offset
				: request.cursor
					? Number.parseInt(
							Buffer.from(request.cursor, "base64url").toString("utf-8"),
							10,
						)
					: 0;

		const orderBy = this.buildOrderBy(request.sort, "am", undefined, queryText);

		// Same hits-CTE shape as searchBooks: each `&@~` on its own PGroonga index.
		const mainResult = hasQuery
			? await db.execute(sql`
				WITH metadata_hits AS (
					SELECT am2.book_id, pgroonga_score(am2.tableoid, am2.ctid) AS score
					FROM audiobook_metadata am2
					WHERE am2.title &@~ ${queryText}
						OR am2.description &@~ ${queryText}
						OR am2.subtitle &@~ ${queryText}
				), author_hits AS (
					SELECT aa2.book_id, 0::float8 AS score
					FROM audiobook_author aa2
					INNER JOIN author a2 ON a2.id = aa2.author_id
					WHERE a2.name &@~ ${queryText}
				), narrator_hits AS (
					SELECT bn2.book_id, 0::float8 AS score
					FROM book_narrator bn2
					INNER JOIN narrator n2 ON n2.id = bn2.narrator_id
					WHERE n2.name &@~ ${queryText}
				), hits AS (
					SELECT book_id, MAX(score) AS score
					FROM (
						SELECT * FROM metadata_hits
						UNION ALL SELECT * FROM author_hits
						UNION ALL SELECT * FROM narrator_hits
					) matched
					GROUP BY book_id
				)
				SELECT
					b.id::text AS id, b.filename, b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					am.title, am.subtitle, am.description,
					am.published_date AS "publishedDate", am.language_code AS "languageCode",
					am.duration, am.cover, am.main_color AS "mainColor",
					jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
					jsonb_build_object('uuid', s.uuid, 'name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', aa.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('uuid', n.uuid, 'name', n.name))
						FILTER (WHERE n.id IS NOT NULL), '[]'
					) AS narrators
				FROM book b
				INNER JOIN hits h ON h.book_id = b.id
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				LEFT JOIN audiobook_author aa ON aa.book_id = b.id
				LEFT JOIN author a ON a.id = aa.author_id
				LEFT JOIN publisher p ON p.id = am.publisher_id
				LEFT JOIN audiobook_series abs ON abs.book_id = b.id
				LEFT JOIN series s ON s.id = abs.series_id
				LEFT JOIN book_narrator bn ON bn.book_id = b.id
				LEFT JOIN narrator n ON n.id = bn.narrator_id
				${whereClause}
				GROUP BY b.id, am.book_id, p.id, s.id, l.server_id
				${orderBy}
				LIMIT ${limit + 1} OFFSET ${offset}
			`)
			: await db.execute(sql`
				SELECT
					b.id::text AS id, b.filename, b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					am.title, am.subtitle, am.description,
					am.published_date AS "publishedDate", am.language_code AS "languageCode",
					am.duration, am.cover, am.main_color AS "mainColor",
					jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
					jsonb_build_object('uuid', s.uuid, 'name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('uuid', a.uuid, 'name', a.name, 'role', aa.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('uuid', n.uuid, 'name', n.name))
						FILTER (WHERE n.id IS NOT NULL), '[]'
					) AS narrators,
					count(*) OVER() AS "totalHits"
				FROM book b
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				LEFT JOIN audiobook_author aa ON aa.book_id = b.id
				LEFT JOIN author a ON a.id = aa.author_id
				LEFT JOIN publisher p ON p.id = am.publisher_id
				LEFT JOIN audiobook_series abs ON abs.book_id = b.id
				LEFT JOIN series s ON s.id = abs.series_id
				LEFT JOIN book_narrator bn ON bn.book_id = b.id
				LEFT JOIN narrator n ON n.id = bn.narrator_id
				${whereClause}
				GROUP BY b.id, am.book_id, p.id, s.id, l.server_id
				${orderBy}
				LIMIT ${limit} OFFSET ${offset}
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

	private buildBookFilters(filters: SearchFilters): SQL[] {
		const conditions: SQL[] = [];

		if (filters.languageCode?.length) {
			conditions.push(sql`bm.language_code = ANY(${filters.languageCode})`);
		}
		if (filters.publishedDateRange?.from) {
			conditions.push(
				sql`bm.published_date >= ${filters.publishedDateRange.from}`,
			);
		}
		if (filters.publishedDateRange?.to) {
			conditions.push(
				sql`bm.published_date <= ${filters.publishedDateRange.to}`,
			);
		}
		if (filters.pageCountRange?.min != null) {
			conditions.push(sql`bm.page_count >= ${filters.pageCountRange.min}`);
		}
		if (filters.pageCountRange?.max != null) {
			conditions.push(sql`bm.page_count <= ${filters.pageCountRange.max}`);
		}
		if (filters.authors?.length) {
			conditions.push(sql`a.name = ANY(${filters.authors})`);
		}
		if (filters.authorUuids?.length) {
			const uuids = sql.join(
				filters.authorUuids.map((uuid) => sql`${uuid}`),
				sql`, `,
			);
			conditions.push(sql`a.uuid = ANY(ARRAY[${uuids}]::uuid[])`);
		}
		if (filters.series?.length) {
			conditions.push(sql`s.name = ANY(${filters.series})`);
		}
		if (filters.publishers?.length) {
			conditions.push(sql`p.name = ANY(${filters.publishers})`);
		}
		if (filters.minRating != null) {
			conditions.push(sql`bm.amazon_rating >= ${filters.minRating}`);
		}
		return conditions;
	}

	private buildAudiobookFilters(filters: SearchAudiobookFilters): SQL[] {
		const conditions: SQL[] = [];

		if (filters.languageCode?.length) {
			conditions.push(sql`am.language_code = ANY(${filters.languageCode})`);
		}
		if (filters.publishedDateRange?.from) {
			conditions.push(
				sql`am.published_date >= ${filters.publishedDateRange.from}`,
			);
		}
		if (filters.publishedDateRange?.to) {
			conditions.push(
				sql`am.published_date <= ${filters.publishedDateRange.to}`,
			);
		}
		if (filters.authors?.length) {
			conditions.push(sql`a.name = ANY(${filters.authors})`);
		}
		if (filters.authorUuids?.length) {
			const uuids = sql.join(
				filters.authorUuids.map((uuid) => sql`${uuid}`),
				sql`, `,
			);
			conditions.push(sql`a.uuid = ANY(ARRAY[${uuids}]::uuid[])`);
		}
		if (filters.narrators?.length) {
			conditions.push(sql`n.name = ANY(${filters.narrators})`);
		}
		if (filters.narratorUuids?.length) {
			const uuids = sql.join(
				filters.narratorUuids.map((uuid) => sql`${uuid}`),
				sql`, `,
			);
			conditions.push(sql`n.uuid = ANY(ARRAY[${uuids}]::uuid[])`);
		}
		if (filters.series?.length) {
			conditions.push(sql`s.name = ANY(${filters.series})`);
		}
		return conditions;
	}

	private buildOrderBy(
		sort: SearchSort | undefined,
		metaAlias: "bm" | "am",
		serverId?: string,
		queryText?: string,
	): SQL {
		switch (sort) {
			case "newest":
				return sql`ORDER BY b.created_at DESC NULLS LAST, b.id DESC`;
			case "oldest":
				return sql`ORDER BY b.created_at ASC NULLS LAST, b.id ASC`;
			case "title_asc":
				return metaAlias === "bm"
					? sql`ORDER BY bm.title ASC NULLS LAST, b.id ASC`
					: sql`ORDER BY am.title ASC NULLS LAST, b.id ASC`;
			case "title_desc":
				return metaAlias === "bm"
					? sql`ORDER BY bm.title DESC NULLS LAST, b.id DESC`
					: sql`ORDER BY am.title DESC NULLS LAST, b.id DESC`;
			case "rating_desc":
				// Books only (audiobooks carry no rating); rank by the Bayesian score
				// so a few glowing reviews can't beat a broadly-loved book (#4/#5).
				return metaAlias === "bm"
					? sql`ORDER BY ${bayesianRatingSql("bm", serverId)} DESC NULLS LAST, b.created_at DESC NULLS LAST, b.id DESC`
					: sql`ORDER BY b.created_at DESC NULLS LAST, b.id DESC`;
			default: {
				// "relevance" (also the default when a query is present, matching ES):
				// exact title match, then title prefix, then PGroonga score. The score
				// comes from the `hits` CTE (where the index-backed match ran —
				// pgroonga_score is 0 outside the query that used the index); MAX()
				// because the queries group by the metadata PK.
				if (!queryText) {
					return sql`ORDER BY b.created_at DESC NULLS LAST, b.id DESC`;
				}
				const title =
					metaAlias === "bm" ? sql.raw("bm.title") : sql.raw("am.title");
				return sql`ORDER BY
					(lower(${title}) = lower(${queryText}))::int DESC,
					(${title} ILIKE ${`${queryText}%`})::int DESC,
					MAX(h.score) DESC,
					b.created_at DESC NULLS LAST, b.id DESC`;
			}
		}
	}
}
