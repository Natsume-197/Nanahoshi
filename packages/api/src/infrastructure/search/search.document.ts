import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";
import { visibleBookSql } from "../../routers/_shared/library-scope";

type SeriesIndexRow = {
	id: string;
	uuid: string;
	name: string | null;
	aliases: string[];
	bookCount: number;
	cover: string | null;
	serverIds: string[];
};

type AuthorIndexRow = {
	id: string;
	uuid: string;
	name: string | null;
	bookCount: number;
	serverIds: string[];
};

type AuthorDoc = {
	id: number;
	uuid?: string;
	name: string | null;
	role: string | null;
};
type AuthorDocWithProvider = AuthorDoc & { provider: string | null };
type NarratorDoc = { id: number; uuid?: string; name: string | null };
type NameRef = {
	uuid?: string | null;
	name: string | null;
	aliases?: string[];
} | null;

type BookIndexRow = {
	id: string;
	filename: string;
	filesizeKb: number | null;
	uuid: string;
	serverId: string;
	libraryId: number;
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
	amazonRating: number | null;
	amazonReviewCount: number | null;
	publisher: NameRef;
	series: NameRef;
	authors: AuthorDocWithProvider[];
};

type BookBatchRow = {
	id: string;
	filename: string;
	filesizeKb: number | null;
	uuid: string;
	serverId: string;
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
	amountChars: number | null;
	amazonRating: number | null;
	amazonReviewCount: number | null;
	publisher: NameRef;
	series: NameRef;
	authors: AuthorDoc[];
};

type AudiobookBatchRow = {
	id: string;
	filename: string;
	uuid: string;
	serverId: string;
	createdAt: string | null;
	lastModified: string | null;
	title: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	duration: number | null;
	asin: string | null;
	cover: string | null;
	publisher: NameRef;
	series: NameRef;
	authors: AuthorDoc[];
	narrators: NarratorDoc[];
};

type AudiobookIndexRow = {
	id: string;
	filename: string;
	uuid: string;
	serverId: string;
	libraryId: number;
	createdAt: string | null;
	lastModified: string | null;
	title: string | null;
	subtitle: string | null;
	description: string | null;
	publishedDate: string | null;
	languageCode: string | null;
	duration: number | null;
	asin: string | null;
	cover: string | null;
	publisher: NameRef;
	series: NameRef;
	authors: AuthorDocWithProvider[];
	narrators: NarratorDoc[];
};

type RelatedEntitiesRow = {
	seriesIds: number[] | null;
	authorIds: number[] | null;
};

export async function fetchSeriesForIndex(
	seriesId: number,
): Promise<Record<string, unknown> | null> {
	const result = await db.execute(sql`
		SELECT
			s.id::text AS id,
			s.uuid,
			s.name,
			s.aliases,
			COUNT(*)::int AS "bookCount",
			(
				SELECT bm2.cover
				FROM book_series bs2
				INNER JOIN book b2 ON b2.id = bs2.book_id
				INNER JOIN book_metadata bm2 ON bm2.book_id = b2.id
				WHERE bs2.series_id = s.id AND bm2.cover IS NOT NULL
					AND ${visibleBookSql("b2")}
				ORDER BY bs2.position ASC NULLS LAST
				LIMIT 1
			) AS cover,
			array_agg(DISTINCT l.server_id) AS "serverIds"
		FROM series s
		INNER JOIN book_series bs ON bs.series_id = s.id
		INNER JOIN book b ON b.id = bs.book_id
		INNER JOIN library l ON l.id = b.library_id
		WHERE s.id = ${seriesId} AND ${visibleBookSql("b")}
		GROUP BY s.id
	`);
	const rows = result.rows as SeriesIndexRow[];
	return rows[0] ?? null;
}

export async function fetchAuthorForIndex(
	authorId: number,
): Promise<Record<string, unknown> | null> {
	const result = await db.execute(sql`
		SELECT
			a.id::text AS id,
			a.uuid,
			a.name,
			COUNT(*)::int AS "bookCount",
			array_agg(DISTINCT l.server_id) AS "serverIds"
		FROM author a
		INNER JOIN (
			SELECT ba.author_id, ba.book_id FROM book_author ba
			UNION ALL
			SELECT aa.author_id, aa.book_id FROM audiobook_author aa
		) combined ON combined.author_id = a.id
		INNER JOIN book b ON b.id = combined.book_id
		INNER JOIN library l ON l.id = b.library_id
		WHERE a.id = ${authorId} AND ${visibleBookSql("b")}
		GROUP BY a.id
	`);
	const rows = result.rows as AuthorIndexRow[];
	return rows[0] ?? null;
}

export async function fetchAllSeriesForIndex(): Promise<
	Record<string, unknown>[]
> {
	const result = await db.execute(sql`
		SELECT
			s.id::text AS id,
			s.uuid,
			s.name,
			s.aliases,
			COUNT(*)::int AS "bookCount",
			(
				SELECT bm2.cover
				FROM book_series bs2
				INNER JOIN book b2 ON b2.id = bs2.book_id
				INNER JOIN book_metadata bm2 ON bm2.book_id = b2.id
				WHERE bs2.series_id = s.id AND bm2.cover IS NOT NULL
					AND ${visibleBookSql("b2")}
				ORDER BY bs2.position ASC NULLS LAST
				LIMIT 1
			) AS cover,
			array_agg(DISTINCT l.server_id) AS "serverIds"
		FROM series s
		INNER JOIN book_series bs ON bs.series_id = s.id
		INNER JOIN book b ON b.id = bs.book_id
		INNER JOIN library l ON l.id = b.library_id
		WHERE ${visibleBookSql("b")}
		GROUP BY s.id
		HAVING COUNT(*) > 1
	`);
	const rows = result.rows as SeriesIndexRow[];
	return rows;
}

export async function fetchAllAuthorsForIndex(): Promise<
	Record<string, unknown>[]
> {
	const result = await db.execute(sql`
		SELECT
			a.id::text AS id,
			a.uuid,
			a.name,
			COUNT(*)::int AS "bookCount",
			array_agg(DISTINCT l.server_id) AS "serverIds"
		FROM author a
		INNER JOIN (
			SELECT ba.author_id, ba.book_id FROM book_author ba
			UNION ALL
			SELECT aa.author_id, aa.book_id FROM audiobook_author aa
		) combined ON combined.author_id = a.id
		INNER JOIN book b ON b.id = combined.book_id
		INNER JOIN library l ON l.id = b.library_id
		WHERE ${visibleBookSql("b")}
		GROUP BY a.id
	`);
	const rows = result.rows as AuthorIndexRow[];
	return rows;
}

export async function fetchBookRelatedEntities(
	bookId: number,
): Promise<{ seriesIds: number[]; authorIds: number[] }> {
	const result = await db.execute(sql`
		SELECT
			COALESCE(
				(SELECT array_agg(DISTINCT bs.series_id) FROM book_series bs WHERE bs.book_id = ${bookId}),
				'{}'
			) AS "seriesIds",
			COALESCE(
				(SELECT array_agg(DISTINCT x.author_id) FROM (
					SELECT ba.author_id FROM book_author ba WHERE ba.book_id = ${bookId}
					UNION ALL
					SELECT aa.author_id FROM audiobook_author aa WHERE aa.book_id = ${bookId}
				) x),
				'{}'
			) AS "authorIds"
	`);
	const row = (result.rows as RelatedEntitiesRow[])[0];
	return {
		seriesIds: row?.seriesIds ?? [],
		authorIds: row?.authorIds ?? [],
	};
}

async function fetchRelatedEntitiesByBookFilter(
	filter: ReturnType<typeof sql>,
): Promise<{ seriesIds: number[]; authorIds: number[] }> {
	const result = await db.execute(sql`
		SELECT
			COALESCE(
				(SELECT array_agg(DISTINCT bs.series_id)
				 FROM book_series bs
				 INNER JOIN book b ON b.id = bs.book_id
				 WHERE ${filter}),
				'{}'
			) AS "seriesIds",
			COALESCE(
				(SELECT array_agg(DISTINCT x.author_id) FROM (
					SELECT ba.author_id FROM book_author ba
					INNER JOIN book b ON b.id = ba.book_id WHERE ${filter}
					UNION ALL
					SELECT aa.author_id FROM audiobook_author aa
					INNER JOIN book b ON b.id = aa.book_id WHERE ${filter}
				) x),
				'{}'
			) AS "authorIds"
	`);
	const row = (result.rows as RelatedEntitiesRow[])[0];
	return {
		seriesIds: row?.seriesIds ?? [],
		authorIds: row?.authorIds ?? [],
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
			l.server_id AS "serverId",
			b.library_id AS "libraryId",
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
			bm.amazon_rating AS "amazonRating",
			bm.amazon_review_count AS "amazonReviewCount",
			jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
			COALESCE(
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM book_series bs INNER JOIN series s ON s.id = bs.series_id
				 WHERE bs.book_id = b.id ORDER BY bs.position ASC NULLS LAST LIMIT 1),
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM audiobook_series abs INNER JOIN series s ON s.id = abs.series_id
				 WHERE abs.book_id = b.id ORDER BY abs.position ASC NULLS LAST LIMIT 1)
			) AS series,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object('id', a.id, 'uuid', a.uuid, 'name', a.name, 'role', ba.role, 'provider', a.provider)
				) FILTER (WHERE a.id IS NOT NULL),
				'[]'
			) AS authors
		FROM book b
		INNER JOIN library l ON l.id = b.library_id
		LEFT JOIN book_metadata bm ON bm.book_id = b.id
		LEFT JOIN book_author ba ON ba.book_id = b.id
		LEFT JOIN author a ON a.id = ba.author_id
		LEFT JOIN publisher p ON p.id = bm.publisher_id
		WHERE b.id = ${bookId} AND l.media_type = 'ebook'
			AND b.duplicate_of_book_id IS NULL
		GROUP BY b.id, bm.book_id, p.id, l.server_id
	`);
	const doc = (rows as BookIndexRow[])[0];
	if (!doc) {
		return null;
	}
	return {
		...doc,
		createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
		lastModified: doc.lastModified
			? new Date(doc.lastModified).toISOString()
			: null,
		publisher: doc.publisher?.name != null ? doc.publisher : null,
		series: doc.series?.name != null ? doc.series : null,
	};
}

export async function fetchBooksForIndexBatch({
	snapshotTime,
	lastId,
	limit,
}: {
	snapshotTime: Date;
	lastId: number | null;
	limit: number;
}): Promise<Record<string, unknown>[]> {
	const { rows } = await db.execute(sql`
		SELECT
			b.id::text,
			b.filename,
			b.filesize_kb AS "filesizeKb",
			b.uuid,
			l.server_id AS "serverId",
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
			bm.amount_chars AS "amountChars",
			bm.amazon_rating AS "amazonRating",
			bm.amazon_review_count AS "amazonReviewCount",
			jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
			COALESCE(
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM book_series bs INNER JOIN series s ON s.id = bs.series_id
				 WHERE bs.book_id = b.id ORDER BY bs.position ASC NULLS LAST LIMIT 1),
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM audiobook_series abs INNER JOIN series s ON s.id = abs.series_id
				 WHERE abs.book_id = b.id ORDER BY abs.position ASC NULLS LAST LIMIT 1)
			) AS series,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object(
						'id', a.id,
						'name', a.name,
						'role', ba.role
					)
				) FILTER (WHERE a.id IS NOT NULL),
				'[]'
			) AS authors
		FROM book b
		INNER JOIN library l ON l.id = b.library_id
		LEFT JOIN book_metadata bm ON bm.book_id = b.id
		LEFT JOIN publisher p ON p.id = bm.publisher_id
		LEFT JOIN book_author ba ON ba.book_id = b.id
		LEFT JOIN author a ON a.id = ba.author_id
		WHERE b.created_at <= ${snapshotTime}
		AND l.media_type = 'ebook'
		AND b.duplicate_of_book_id IS NULL
		${lastId ? sql`AND b.id > ${Number(lastId)}` : sql``}
		GROUP BY b.id, bm.book_id, p.id, l.server_id
		ORDER BY b.id ASC
		LIMIT ${limit}
	`);
	return rows as BookBatchRow[];
}

export async function fetchAudiobooksForIndexBatch({
	snapshotTime,
	lastId,
	limit,
}: {
	snapshotTime: Date;
	lastId: number | null;
	limit: number;
}): Promise<Record<string, unknown>[]> {
	const { rows } = await db.execute(sql`
		SELECT
			b.id::text,
			b.filename,
			b.uuid,
			l.server_id AS "serverId",
			b.created_at AS "createdAt",
			b.last_modified AS "lastModified",
			am.title,
			am.subtitle,
			am.description,
			am.published_date AS "publishedDate",
			am.language_code AS "languageCode",
			am.duration,
			am.asin,
			am.cover,
			jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
			COALESCE(
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM book_series bs INNER JOIN series s ON s.id = bs.series_id
				 WHERE bs.book_id = b.id ORDER BY bs.position ASC NULLS LAST LIMIT 1),
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM audiobook_series abs INNER JOIN series s ON s.id = abs.series_id
				 WHERE abs.book_id = b.id ORDER BY abs.position ASC NULLS LAST LIMIT 1)
			) AS series,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object(
						'id', a.id,
						'name', a.name,
						'role', aa.role
					)
				) FILTER (WHERE a.id IS NOT NULL),
				'[]'
			) AS authors,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object('id', n.id, 'uuid', n.uuid, 'name', n.name)
				) FILTER (WHERE n.id IS NOT NULL),
				'[]'
			) AS narrators
		FROM book b
		INNER JOIN library l ON l.id = b.library_id
		LEFT JOIN audiobook_metadata am ON am.book_id = b.id
		LEFT JOIN publisher p ON p.id = am.publisher_id
		LEFT JOIN audiobook_author aa ON aa.book_id = b.id
		LEFT JOIN author a ON a.id = aa.author_id
		LEFT JOIN book_narrator bn ON bn.book_id = b.id
		LEFT JOIN narrator n ON n.id = bn.narrator_id
		WHERE b.created_at <= ${snapshotTime}
		AND l.media_type = 'audiobook'
		${lastId ? sql`AND b.id > ${Number(lastId)}` : sql``}
		GROUP BY b.id, am.book_id, p.id, l.server_id
		ORDER BY b.id ASC
		LIMIT ${limit}
	`);
	return rows as AudiobookBatchRow[];
}

export async function fetchAudiobookForIndex(
	bookId: number,
): Promise<Record<string, unknown> | null> {
	const { rows } = await db.execute(sql`
		SELECT
			b.id::text AS id,
			b.filename,
			b.uuid,
			l.server_id AS "serverId",
			b.library_id AS "libraryId",
			b.created_at AS "createdAt",
			b.last_modified AS "lastModified",
			am.title,
			am.subtitle,
			am.description,
			am.published_date AS "publishedDate",
			am.language_code AS "languageCode",
			am.duration,
			am.asin,
			am.cover,
			jsonb_build_object('uuid', p.uuid, 'name', p.name) AS publisher,
			COALESCE(
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM book_series bs INNER JOIN series s ON s.id = bs.series_id
				 WHERE bs.book_id = b.id ORDER BY bs.position ASC NULLS LAST LIMIT 1),
				(SELECT jsonb_build_object('uuid', s.uuid, 'name', s.name, 'aliases', s.aliases)
				 FROM audiobook_series abs INNER JOIN series s ON s.id = abs.series_id
				 WHERE abs.book_id = b.id ORDER BY abs.position ASC NULLS LAST LIMIT 1)
			) AS series,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object('id', a.id, 'uuid', a.uuid, 'name', a.name, 'role', aa.role, 'provider', a.provider)
				) FILTER (WHERE a.id IS NOT NULL),
				'[]'
			) AS authors,
			COALESCE(
				jsonb_agg(
					DISTINCT jsonb_build_object('id', n.id, 'uuid', n.uuid, 'name', n.name)
				) FILTER (WHERE n.id IS NOT NULL),
				'[]'
			) AS narrators
		FROM book b
		INNER JOIN library l ON l.id = b.library_id
		LEFT JOIN audiobook_metadata am ON am.book_id = b.id
		LEFT JOIN audiobook_author aa ON aa.book_id = b.id
		LEFT JOIN author a ON a.id = aa.author_id
		LEFT JOIN publisher p ON p.id = am.publisher_id
		LEFT JOIN book_narrator bn ON bn.book_id = b.id
		LEFT JOIN narrator n ON n.id = bn.narrator_id
		WHERE b.id = ${bookId} AND l.media_type = 'audiobook'
		GROUP BY b.id, am.book_id, p.id, l.server_id
	`);
	const doc = (rows as AudiobookIndexRow[])[0];
	if (!doc) {
		return null;
	}
	return {
		...doc,
		createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
		lastModified: doc.lastModified
			? new Date(doc.lastModified).toISOString()
			: null,
		publisher: doc.publisher?.name != null ? doc.publisher : null,
		series: doc.series?.name != null ? doc.series : null,
	};
}
