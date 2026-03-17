import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";

export async function fetchSeriesForIndex(
	seriesId: number,
): Promise<Record<string, unknown> | null> {
	const { rows } = await db.execute(sql`
		SELECT
			s.id::text AS id,
			s.name,
			COUNT(DISTINCT b.id)::int AS "bookCount",
			(
				SELECT bm2.cover
				FROM book_series bs2
				INNER JOIN book b2 ON b2.id = bs2.book_id
				INNER JOIN book_metadata bm2 ON bm2.book_id = b2.id
				WHERE bs2.series_id = s.id AND bm2.cover IS NOT NULL
				ORDER BY bs2.position ASC NULLS LAST
				LIMIT 1
			) AS cover,
			array_agg(DISTINCT l.organization_id) AS "organizationIds"
		FROM series s
		INNER JOIN book_series bs ON bs.series_id = s.id
		INNER JOIN book b ON b.id = bs.book_id
		INNER JOIN library l ON l.id = b.library_id
		WHERE s.id = ${seriesId}
		GROUP BY s.id
	`);
	if (rows.length === 0) return null;
	return rows[0] as Record<string, unknown>;
}

export async function fetchAuthorForIndex(
	authorId: number,
): Promise<Record<string, unknown> | null> {
	const { rows } = await db.execute(sql`
		SELECT
			a.id::text AS id,
			a.name,
			COUNT(DISTINCT b.id)::int AS "bookCount",
			array_agg(DISTINCT l.organization_id) AS "organizationIds"
		FROM author a
		INNER JOIN book_author ba ON ba.author_id = a.id
		INNER JOIN book b ON b.id = ba.book_id
		INNER JOIN library l ON l.id = b.library_id
		WHERE a.id = ${authorId}
		GROUP BY a.id
	`);
	if (rows.length === 0) return null;
	return rows[0] as Record<string, unknown>;
}

export async function fetchAllSeriesForIndex(): Promise<
	Record<string, unknown>[]
> {
	const { rows } = await db.execute(sql`
		SELECT
			s.id::text AS id,
			s.name,
			COUNT(DISTINCT b.id)::int AS "bookCount",
			(
				SELECT bm2.cover
				FROM book_series bs2
				INNER JOIN book b2 ON b2.id = bs2.book_id
				INNER JOIN book_metadata bm2 ON bm2.book_id = b2.id
				WHERE bs2.series_id = s.id AND bm2.cover IS NOT NULL
				ORDER BY bs2.position ASC NULLS LAST
				LIMIT 1
			) AS cover,
			array_agg(DISTINCT l.organization_id) AS "organizationIds"
		FROM series s
		INNER JOIN book_series bs ON bs.series_id = s.id
		INNER JOIN book b ON b.id = bs.book_id
		INNER JOIN library l ON l.id = b.library_id
		GROUP BY s.id
		HAVING COUNT(DISTINCT b.id) > 1
	`);
	return rows as Record<string, unknown>[];
}

export async function fetchAllAuthorsForIndex(): Promise<
	Record<string, unknown>[]
> {
	const { rows } = await db.execute(sql`
		SELECT
			a.id::text AS id,
			a.name,
			COUNT(DISTINCT b.id)::int AS "bookCount",
			array_agg(DISTINCT l.organization_id) AS "organizationIds"
		FROM author a
		INNER JOIN book_author ba ON ba.author_id = a.id
		INNER JOIN book b ON b.id = ba.book_id
		INNER JOIN library l ON l.id = b.library_id
		GROUP BY a.id
	`);
	return rows as Record<string, unknown>[];
}

export async function fetchBookRelatedEntities(
	bookId: number,
): Promise<{ seriesIds: number[]; authorIds: number[] }> {
	const { rows } = await db.execute(sql`
		SELECT
			COALESCE(
				(SELECT array_agg(DISTINCT bs.series_id) FROM book_series bs WHERE bs.book_id = ${bookId}),
				'{}'
			) AS "seriesIds",
			COALESCE(
				(SELECT array_agg(DISTINCT ba.author_id) FROM book_author ba WHERE ba.book_id = ${bookId}),
				'{}'
			) AS "authorIds"
	`);
	const row = rows[0] as Record<string, unknown> | undefined;
	return {
		seriesIds: (row?.seriesIds as number[]) ?? [],
		authorIds: (row?.authorIds as number[]) ?? [],
	};
}

async function fetchRelatedEntitiesByBookFilter(
	filter: ReturnType<typeof sql>,
): Promise<{ seriesIds: number[]; authorIds: number[] }> {
	const { rows } = await db.execute(sql`
		SELECT
			COALESCE(
				(SELECT array_agg(DISTINCT bs.series_id)
				 FROM book_series bs
				 INNER JOIN book b ON b.id = bs.book_id
				 WHERE ${filter}),
				'{}'
			) AS "seriesIds",
			COALESCE(
				(SELECT array_agg(DISTINCT ba.author_id)
				 FROM book_author ba
				 INNER JOIN book b ON b.id = ba.book_id
				 WHERE ${filter}),
				'{}'
			) AS "authorIds"
	`);
	const row = rows[0] as Record<string, unknown> | undefined;
	return {
		seriesIds: (row?.seriesIds as number[]) ?? [],
		authorIds: (row?.authorIds as number[]) ?? [],
	};
}

export function fetchRelatedEntitiesByLibraryId(libraryId: number) {
	return fetchRelatedEntitiesByBookFilter(sql`b.library_id = ${libraryId}`);
}

export function fetchRelatedEntitiesByLibraryPathId(pathId: number) {
	return fetchRelatedEntitiesByBookFilter(sql`b.library_path_id = ${pathId}`);
}

export async function fetchBookForIndex(
	bookId: number,
): Promise<Record<string, unknown> | null> {
	const { rows } = await db.execute(sql`
		SELECT
			b.id::text AS id,
			b.filename,
			b.filesize_kb AS "filesizeKb",
			b.uuid,
			l.organization_id AS "organizationId",
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
			jsonb_build_object('name', p.name) AS publisher,
			jsonb_build_object('name', s.name) AS series,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role, 'provider', a.provider)
				) FILTER (WHERE a.id IS NOT NULL),
				'[]'
			) AS authors
		FROM book b
		INNER JOIN library l ON l.id = b.library_id
		LEFT JOIN book_metadata bm ON bm.book_id = b.id
		LEFT JOIN publisher p ON p.id = bm.publisher_id
		LEFT JOIN series s ON s.id = bm.series_id
		LEFT JOIN book_author ba ON ba.book_id = b.id
		LEFT JOIN author a ON a.id = ba.author_id
		WHERE b.id = ${bookId}
		GROUP BY b.id, bm.book_id, p.id, s.id, l.organization_id
	`);
	if (rows.length === 0) return null;
	const doc = rows[0] as Record<string, unknown> | undefined;
	if (!doc) {
		return null;
	}
	return {
		...doc,
		createdAt: doc.createdAt
			? new Date(doc.createdAt as string).toISOString()
			: null,
		lastModified: doc.lastModified
			? new Date(doc.lastModified as string).toISOString()
			: null,
		publisher:
			(doc.publisher as Record<string, unknown>)?.name != null
				? doc.publisher
				: null,
		series:
			(doc.series as Record<string, unknown>)?.name != null ? doc.series : null,
	};
}
