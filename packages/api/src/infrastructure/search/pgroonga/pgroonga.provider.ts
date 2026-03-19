import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import type { SearchProvider } from "../search.provider";
import type {
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

	async searchSeries(
		request: SearchSeriesRequest,
	): Promise<SearchSeriesResponse> {
		const limit = Math.min(Math.max(request.limit ?? 5, 1), 10);
		const queryText = request.query?.trim();
		if (!queryText) return { series: [] };

		const orgCondition = request.organizationId
			? sql`AND l.organization_id = ${request.organizationId}`
			: sql``;
		const coverOrgCondition = request.organizationId
			? sql`AND l2.organization_id = ${request.organizationId}`
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
						${coverOrgCondition}
					ORDER BY bs2.position ASC NULLS LAST
					LIMIT 1
				) AS cover
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
		`;

		// PGroonga full-text search (handles Japanese tokenization)
		const result = await db.execute(sql`
			${baseQuery}
			WHERE s.name &@~ ${queryText} ${orgCondition}
			${groupOrder}
		`);

		// Fallback to ILIKE for substring matches (e.g. "la" → "lala")
		const rows =
			result.rows.length > 0
				? result.rows
				: (
						await db.execute(sql`
			${baseQuery}
			WHERE s.name ILIKE ${`%${queryText}%`} ${orgCondition}
			${groupOrder}
		`)
					).rows;

		const series: SearchSeriesHit[] = rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			bookCount: row.bookCount as number,
			cover: row.cover as string | null,
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
			INNER JOIN book_author ba ON ba.author_id = a.id
			INNER JOIN book b ON b.id = ba.book_id
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
			WHERE a.name &@~ ${queryText} ${orgCondition}
			${groupOrder}
		`);

		// Fallback to ILIKE for substring matches (e.g. "la" → "lala")
		const rows =
			result.rows.length > 0
				? result.rows
				: (
						await db.execute(sql`
			${baseQuery}
			WHERE a.name ILIKE ${`%${queryText}%`} ${orgCondition}
			${groupOrder}
		`)
					).rows;

		const authors: SearchAuthorHit[] = rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			bookCount: row.bookCount as number,
		}));

		return { authors };
	}

	async searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse> {
		const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
		const queryText = request.query?.trim();
		const hasQuery = !!queryText;

		// Build WHERE conditions
		const conditions: SQL[] = [];

		if (request.organizationId) {
			conditions.push(sql`l.organization_id = ${request.organizationId}`);
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
			conditions.push(...this.buildFilters(request.filters));
		}

		const whereClause =
			conditions.length > 0
				? sql`WHERE ${sql.join(conditions, sql` AND `)}`
				: sql``;

		// Decode cursor as offset
		const offset = request.cursor
			? Number.parseInt(
					Buffer.from(request.cursor, "base64url").toString("utf-8"),
					10,
				)
			: 0;

		const orderBy = this.buildOrderBy(request.sort, hasQuery);

		// Single query with window function for total count
		const mainResult = hasQuery
			? await db.execute(sql`
				SELECT
					b.id::text AS id,
					b.filename,
					b.filesize_kb AS "filesizeKb",
					b.uuid,
					b.created_at AS "createdAt",
					b.last_modified AS "lastModified",
					bm.title,
					bm.title_romaji AS "titleRomaji",
					bm.subtitle,
					bm.description,
					bm.published_date AS "publishedDate",
					bm.language_code AS "languageCode",
					bm.page_count AS "pageCount",
					bm.isbn_10 AS "isbn10",
					bm.isbn_13 AS "isbn13",
					bm.asin,
					bm.cover,
					bm.main_color AS "mainColor",
					jsonb_build_object('name', p.name) AS publisher,
					jsonb_build_object('name', s.name) AS series,
					COALESCE(
						jsonb_agg(
							DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role, 'provider', a.provider)
						) FILTER (WHERE a.id IS NOT NULL),
						'[]'
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
					b.id::text AS id,
					b.filename,
					b.filesize_kb AS "filesizeKb",
					b.uuid,
					b.created_at AS "createdAt",
					b.last_modified AS "lastModified",
					bm.title,
					bm.title_romaji AS "titleRomaji",
					bm.subtitle,
					bm.description,
					bm.published_date AS "publishedDate",
					bm.language_code AS "languageCode",
					bm.page_count AS "pageCount",
					bm.isbn_10 AS "isbn10",
					bm.isbn_13 AS "isbn13",
					bm.asin,
					bm.cover,
					bm.main_color AS "mainColor",
					jsonb_build_object('name', p.name) AS publisher,
					jsonb_build_object('name', s.name) AS series,
					COALESCE(
						jsonb_agg(
							DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role, 'provider', a.provider)
						) FILTER (WHERE a.id IS NOT NULL),
						'[]'
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

		const totalHits = Number(
			(mainResult.rows[0] as Record<string, unknown>)?.totalHits ?? 0,
		);
		const hasMore = offset + limit < totalHits;

		const books: SearchBookHit[] = mainResult.rows.map(
			(row: Record<string, unknown>) => {
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
						? new Date(publicSource.createdAt as string).toISOString()
						: null,
					lastModified: publicSource.lastModified
						? new Date(publicSource.lastModified as string).toISOString()
						: null,
					publisher:
						(publicSource.publisher as Record<string, unknown>)?.name != null
							? publicSource.publisher
							: null,
					series:
						(publicSource.series as Record<string, unknown>)?.name != null
							? publicSource.series
							: null,
					highlight:
						hasQuery && (highlightTitle || highlightDescription)
							? {
									title: highlightTitle as string | undefined,
									description: highlightDescription as string | undefined,
								}
							: undefined,
				} as unknown as SearchBookHit;
			},
		);

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
				totalHitsRelation: "eq",
			},
		};
	}

	async getIndexedCount(): Promise<number> {
		const result = await db.execute(
			sql`SELECT COUNT(*)::int AS count FROM book`,
		);
		return Number((result.rows[0] as Record<string, unknown>)?.count ?? 0);
	}

	requiresSync(): boolean {
		return false;
	}

	private buildFilters(filters: SearchFilters): SQL[] {
		const conditions: SQL[] = [];

		if (filters.languageCode?.length) {
			conditions.push(sql`bm.language_code = ANY(${filters.languageCode})`);
		}

		if (filters.publishedDateRange) {
			if (filters.publishedDateRange.from) {
				conditions.push(
					sql`bm.published_date >= ${filters.publishedDateRange.from}`,
				);
			}
			if (filters.publishedDateRange.to) {
				conditions.push(
					sql`bm.published_date <= ${filters.publishedDateRange.to}`,
				);
			}
		}

		if (filters.pageCountRange) {
			if (filters.pageCountRange.min != null) {
				conditions.push(sql`bm.page_count >= ${filters.pageCountRange.min}`);
			}
			if (filters.pageCountRange.max != null) {
				conditions.push(sql`bm.page_count <= ${filters.pageCountRange.max}`);
			}
		}

		if (filters.authors?.length) {
			conditions.push(sql`a.name = ANY(${filters.authors})`);
		}

		if (filters.authorIds?.length) {
			const ids = sql.join(
				filters.authorIds.map((id) => sql`${id}`),
				sql`, `,
			);
			conditions.push(sql`a.id = ANY(ARRAY[${ids}]::int[])`);
		}

		if (filters.series?.length) {
			conditions.push(sql`s.name = ANY(${filters.series})`);
		}

		if (filters.publishers?.length) {
			conditions.push(sql`p.name = ANY(${filters.publishers})`);
		}

		return conditions;
	}

	private buildOrderBy(sort: SearchSort | undefined, _hasQuery: boolean): SQL {
		switch (sort) {
			case "newest":
				return sql`ORDER BY b.created_at DESC NULLS LAST, b.id DESC`;
			case "oldest":
				return sql`ORDER BY b.created_at ASC NULLS LAST, b.id ASC`;
			case "title_asc":
				return sql`ORDER BY bm.title ASC NULLS LAST, b.id ASC`;
			case "title_desc":
				return sql`ORDER BY bm.title DESC NULLS LAST, b.id DESC`;
			default:
				return sql`ORDER BY b.created_at DESC NULLS LAST, b.id DESC`;
		}
	}
}
