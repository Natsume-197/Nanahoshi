import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";

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
					DISTINCT jsonb_build_object('id', a.id, 'name', a.name, 'role', ba.role)
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
