import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../../../routers/_shared/library-scope";
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
	name: string;
	bookCount: number;
	cover: string | null;
	author: { id: number; name: string } | null;
};

type AuthorSearchRow = {
	id: number;
	name: string;
	bookCount: number;
};

type SearchAuthorRef = {
	id: number;
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
	publisher: { name: string | null } | null;
	series: { name: string | null } | null;
	authors: SearchAuthorRef[];
	totalHits: number | string;
	highlightTitle?: string | null;
	highlightDescription?: string | null;
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
	publisher: { name: string | null } | null;
	series: { name: string | null } | null;
	authors: SearchAuthorRef[];
	narrators: { id: number; name: string }[];
	totalHits: number | string;
	highlightTitle?: string | null;
	highlightDescription?: string | null;
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

		const orgCondition = request.organizationId
			? sql`AND l.organization_id = ${request.organizationId}`
			: sql``;
		const coverOrgCondition = request.organizationId
			? sql`AND l2.organization_id = ${request.organizationId}`
			: sql``;
		const authorOrgCondition = request.organizationId
			? sql`AND l3.organization_id = ${request.organizationId}`
			: sql``;

		const baseQuery = sql`
			SELECT
				s.id,
				s.name,
				COUNT(DISTINCT b.id)::int AS "bookCount",
				(
					SELECT bm2.cover
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
				) AS cover,
				(
					SELECT jsonb_build_object('id', a.id, 'name', a.name)
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
		const groupOrder = sql`
			GROUP BY s.id
			HAVING COUNT(DISTINCT b.id) > 1
			ORDER BY s.name ASC
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
			id: row.id,
			name: row.name,
			bookCount: row.bookCount,
			cover: row.cover,
			author: row.author,
		}));

		return { series };
	}

	async searchAuthors(
		request: SearchAuthorsRequest,
	): Promise<SearchAuthorsResponse> {
		const limit = Math.min(Math.max(request.limit ?? 5, 1), 10);
		const queryText = request.query?.trim();
		if (!queryText) return { authors: [] };

		const orgCondition = request.organizationId
			? sql`AND l.organization_id = ${request.organizationId}`
			: sql``;

		const baseQuery = sql`
			SELECT
				a.id,
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
			ORDER BY a.name ASC
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
			id: row.id,
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

		if (request.organizationId) {
			conditions.push(sql`l.organization_id = ${request.organizationId}`);
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

		if (hasQuery) {
			conditions.push(sql`(
				bm.title &@~ ${queryText}
				OR bm.description &@~ ${queryText}
				OR bm.subtitle &@~ ${queryText}
				OR bm.title_romaji &@~ ${queryText}
				OR a.name &@~ ${queryText}
			)`);
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

		const orderBy = this.buildOrderBy(request.sort, "bm");

		const mainResult = hasQuery
			? await db.execute(sql`
				SELECT
					b.id::text AS id, b.filename, b.filesize_kb AS "filesizeKb", b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					bm.title, bm.title_romaji AS "titleRomaji", bm.subtitle, bm.description,
					bm.published_date AS "publishedDate", bm.language_code AS "languageCode",
					bm.page_count AS "pageCount", bm.isbn_10 AS "isbn10", bm.isbn_13 AS "isbn13",
					bm.asin, bm.cover, bm.main_color AS "mainColor",
					jsonb_build_object('name', p.name) AS publisher,
					jsonb_build_object('name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors,
					count(*) OVER() AS "totalHits",
					pgroonga_highlight_html(COALESCE(bm.title, ''), pgroonga_query_extract_keywords(${queryText})) AS "highlightTitle",
					pgroonga_highlight_html(COALESCE(LEFT(bm.description, 500), ''), pgroonga_query_extract_keywords(${queryText})) AS "highlightDescription"
				FROM book b
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				LEFT JOIN book_author ba ON ba.book_id = b.id
				LEFT JOIN author a ON a.id = ba.author_id
				LEFT JOIN publisher p ON p.id = bm.publisher_id
				LEFT JOIN series s ON s.id = bm.series_id
				${whereClause}
				GROUP BY b.id, bm.book_id, p.id, s.id, l.organization_id
				${orderBy}
				LIMIT ${limit} OFFSET ${offset}
			`)
			: await db.execute(sql`
				SELECT
					b.id::text AS id, b.filename, b.filesize_kb AS "filesizeKb", b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					bm.title, bm.title_romaji AS "titleRomaji", bm.subtitle, bm.description,
					bm.published_date AS "publishedDate", bm.language_code AS "languageCode",
					bm.page_count AS "pageCount", bm.isbn_10 AS "isbn10", bm.isbn_13 AS "isbn13",
					bm.asin, bm.cover, bm.main_color AS "mainColor",
					jsonb_build_object('name', p.name) AS publisher,
					jsonb_build_object('name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors,
					count(*) OVER() AS "totalHits"
				FROM book b
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				LEFT JOIN book_author ba ON ba.book_id = b.id
				LEFT JOIN author a ON a.id = ba.author_id
				LEFT JOIN publisher p ON p.id = bm.publisher_id
				LEFT JOIN series s ON s.id = bm.series_id
				${whereClause}
				GROUP BY b.id, bm.book_id, p.id, s.id, l.organization_id
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

		if (request.organizationId) {
			conditions.push(sql`l.organization_id = ${request.organizationId}`);
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

		if (hasQuery) {
			conditions.push(sql`(
				am.title &@~ ${queryText}
				OR am.description &@~ ${queryText}
				OR am.subtitle &@~ ${queryText}
				OR a.name &@~ ${queryText}
				OR n.name &@~ ${queryText}
			)`);
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

		const orderBy = this.buildOrderBy(request.sort, "am");

		const mainResult = hasQuery
			? await db.execute(sql`
				SELECT
					b.id::text AS id, b.filename, b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					am.title, am.subtitle, am.description,
					am.published_date AS "publishedDate", am.language_code AS "languageCode",
					am.duration, am.cover, am.main_color AS "mainColor",
					jsonb_build_object('name', p.name) AS publisher,
					jsonb_build_object('name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', aa.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('id', n.id, 'name', n.name))
						FILTER (WHERE n.id IS NOT NULL), '[]'
					) AS narrators,
					count(*) OVER() AS "totalHits",
					pgroonga_highlight_html(COALESCE(am.title, ''), pgroonga_query_extract_keywords(${queryText})) AS "highlightTitle",
					pgroonga_highlight_html(COALESCE(LEFT(am.description, 500), ''), pgroonga_query_extract_keywords(${queryText})) AS "highlightDescription"
				FROM book b
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				LEFT JOIN audiobook_author aa ON aa.book_id = b.id
				LEFT JOIN author a ON a.id = aa.author_id
				LEFT JOIN publisher p ON p.id = am.publisher_id
				LEFT JOIN series s ON s.id = am.series_id
				LEFT JOIN book_narrator bn ON bn.book_id = b.id
				LEFT JOIN narrator n ON n.id = bn.narrator_id
				${whereClause}
				GROUP BY b.id, am.book_id, p.id, s.id, l.organization_id
				${orderBy}
				LIMIT ${limit} OFFSET ${offset}
			`)
			: await db.execute(sql`
				SELECT
					b.id::text AS id, b.filename, b.uuid,
					b.created_at AS "createdAt", b.last_modified AS "lastModified",
					am.title, am.subtitle, am.description,
					am.published_date AS "publishedDate", am.language_code AS "languageCode",
					am.duration, am.cover, am.main_color AS "mainColor",
					jsonb_build_object('name', p.name) AS publisher,
					jsonb_build_object('name', s.name) AS series,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', aa.role, 'provider', a.provider))
						FILTER (WHERE a.id IS NOT NULL), '[]'
					) AS authors,
					COALESCE(
						jsonb_agg(DISTINCT jsonb_build_object('id', n.id, 'name', n.name))
						FILTER (WHERE n.id IS NOT NULL), '[]'
					) AS narrators,
					count(*) OVER() AS "totalHits"
				FROM book b
				INNER JOIN library l ON l.id = b.library_id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				LEFT JOIN audiobook_author aa ON aa.book_id = b.id
				LEFT JOIN author a ON a.id = aa.author_id
				LEFT JOIN publisher p ON p.id = am.publisher_id
				LEFT JOIN series s ON s.id = am.series_id
				LEFT JOIN book_narrator bn ON bn.book_id = b.id
				LEFT JOIN narrator n ON n.id = bn.narrator_id
				${whereClause}
				GROUP BY b.id, am.book_id, p.id, s.id, l.organization_id
				${orderBy}
				LIMIT ${limit} OFFSET ${offset}
			`);

		const rows = mainResult.rows as AudiobookSearchRow[];
		const totalHits = Number(rows[0]?.totalHits ?? 0);
		const hasMore = offset + limit < totalHits;

		const audiobooks: SearchAudiobookHit[] = rows.map((row) => {
			const {
				highlightTitle,
				highlightDescription,
				totalHits: _totalHits,
				...source
			} = row;
			return {
				...source,
				id: Number(source.id),
				createdAt: source.createdAt
					? new Date(source.createdAt).toISOString()
					: null,
				lastModified: source.lastModified
					? new Date(source.lastModified).toISOString()
					: null,
				publisher: source.publisher?.name != null ? source.publisher : null,
				series: source.series?.name != null ? source.series : null,
				highlight:
					hasQuery && (highlightTitle || highlightDescription)
						? {
								title: highlightTitle ?? undefined,
								description: highlightDescription ?? undefined,
							}
						: undefined,
			} as unknown as SearchAudiobookHit;
		});

		let cursor: string | undefined;
		if (hasMore) {
			cursor = Buffer.from(String(offset + limit)).toString("base64url");
		}

		return {
			audiobooks,
			pagination: { cursor, hasMore, totalHits, totalHitsRelation: "eq" },
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
		const totalHits = Number(rows[0]?.totalHits ?? 0);
		const hasMore = offset + limit < totalHits;

		const books: SearchBookHit[] = rows.map((row) => {
			const {
				highlightTitle,
				highlightDescription,
				totalHits: _totalHits,
				...publicSource
			} = row;
			return {
				...publicSource,
				id: Number(publicSource.id),
				createdAt: publicSource.createdAt
					? new Date(publicSource.createdAt).toISOString()
					: null,
				lastModified: publicSource.lastModified
					? new Date(publicSource.lastModified).toISOString()
					: null,
				publisher:
					publicSource.publisher?.name != null ? publicSource.publisher : null,
				series: publicSource.series?.name != null ? publicSource.series : null,
				highlight:
					hasQuery && (highlightTitle || highlightDescription)
						? {
								title: highlightTitle ?? undefined,
								description: highlightDescription ?? undefined,
							}
						: undefined,
			} as unknown as SearchBookHit;
		});

		let cursor: string | undefined;
		if (hasMore) {
			cursor = Buffer.from(String(offset + limit)).toString("base64url");
		}

		return {
			books,
			pagination: { cursor, hasMore, totalHits, totalHitsRelation: "eq" },
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
		if (filters.authorIds?.length) {
			const ids = sql.join(
				filters.authorIds.map((id) => sql`${id}`),
				sql`, `,
			);
			conditions.push(sql`a.id = ANY(ARRAY[${ids}]::bigint[])`);
		}
		if (filters.series?.length) {
			conditions.push(sql`s.name = ANY(${filters.series})`);
		}
		if (filters.publishers?.length) {
			conditions.push(sql`p.name = ANY(${filters.publishers})`);
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
		if (filters.authorIds?.length) {
			const ids = sql.join(
				filters.authorIds.map((id) => sql`${id}`),
				sql`, `,
			);
			conditions.push(sql`a.id = ANY(ARRAY[${ids}]::bigint[])`);
		}
		if (filters.narrators?.length) {
			conditions.push(sql`n.name = ANY(${filters.narrators})`);
		}
		if (filters.narratorIds?.length) {
			const ids = sql.join(
				filters.narratorIds.map((id) => sql`${id}`),
				sql`, `,
			);
			conditions.push(sql`n.id = ANY(ARRAY[${ids}]::bigint[])`);
		}
		if (filters.series?.length) {
			conditions.push(sql`s.name = ANY(${filters.series})`);
		}
		return conditions;
	}

	private buildOrderBy(
		sort: SearchSort | undefined,
		metaAlias: "bm" | "am",
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
			default:
				return sql`ORDER BY b.created_at DESC NULLS LAST, b.id DESC`;
		}
	}
}
