import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../_shared/library-scope";

export type SeriesSort = "name" | "books" | "recent";

const ORDER_BY: Record<SeriesSort, SQL> = {
	name: sql`s.name ASC`,
	books: sql`"bookCount" DESC, s.name ASC`,
	recent: sql`s.created_at DESC NULLS LAST, s.name ASC`,
};

export class SeriesRepository {
	async listWithBookCount(
		organizationId?: string,
		limit = 30,
		offset = 0,
		sort: SeriesSort = "name",
	) {
		const result = await db.execute(sql`
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
						${organizationId ? sql`AND l2.organization_id = ${organizationId}` : sql``}
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
						${organizationId ? sql`AND l3.organization_id = ${organizationId}` : sql``}
					GROUP BY a.id, a.name
					ORDER BY COUNT(*) DESC, a.name ASC
					LIMIT 1
				) AS author
			FROM series s
			INNER JOIN book_series bs ON bs.series_id = s.id
			INNER JOIN book b ON b.id = bs.book_id
			INNER JOIN library l ON l.id = b.library_id
			WHERE ${visibleBookSql("b")}
				${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
			GROUP BY s.id
			HAVING COUNT(DISTINCT b.id) > 1
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		return result.rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			bookCount: row.bookCount as number,
			cover: row.cover as string | null,
			author: row.author as { id: number; name: string } | null,
		}));
	}

	async count(organizationId?: string) {
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT s.id
				FROM series s
				INNER JOIN book_series bs ON bs.series_id = s.id
				INNER JOIN book b ON b.id = bs.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
				GROUP BY s.id
				HAVING COUNT(DISTINCT b.id) > 1
			) t
		`);
		return (result.rows[0]?.count as number) ?? 0;
	}
}

export const seriesRepository = new SeriesRepository();
