import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../_shared/library-scope";

export type GenreSort = "name" | "books" | "recent";

const ORDER_BY: Record<GenreSort, SQL> = {
	name: sql`g.name ASC`,
	books: sql`"bookCount" DESC, g.name ASC`,
	recent: sql`g.created_at DESC NULLS LAST, g.name ASC`,
};

export class GenreRepository {
	async listWithBookCount(
		organizationId?: string,
		limit = 30,
		offset = 0,
		sort: GenreSort = "name",
		query?: string,
	) {
		const filters: SQL[] = [visibleBookSql("b")];
		if (organizationId)
			filters.push(sql`l.organization_id = ${organizationId}`);
		if (query) filters.push(sql`g.name ILIKE ${`%${query}%`}`);
		const whereSql = filters.length
			? sql`WHERE ${sql.join(filters, sql` AND `)}`
			: sql``;

		const result = await db.execute(sql`
			SELECT
				g.id,
				g.name,
				COUNT(DISTINCT b.id)::int AS "bookCount",
				(
					SELECT bm2.cover
					FROM book_genre bg2
					INNER JOIN book_metadata bm2 ON bm2.book_id = bg2.book_id
					INNER JOIN book b2 ON b2.id = bg2.book_id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE bg2.genre_id = g.id
						AND bm2.cover IS NOT NULL
						AND ${visibleBookSql("b2")}
						${organizationId ? sql`AND l2.organization_id = ${organizationId}` : sql``}
					LIMIT 1
				) AS cover
			FROM genre g
			INNER JOIN book_genre bg ON bg.genre_id = g.id
			INNER JOIN book b ON b.id = bg.book_id
			INNER JOIN library l ON l.id = b.library_id
			${whereSql}
			GROUP BY g.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		return result.rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			bookCount: row.bookCount as number,
			cover: row.cover as string | null,
		}));
	}

	async count(organizationId?: string) {
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT g.id
				FROM genre g
				INNER JOIN book_genre bg ON bg.genre_id = g.id
				INNER JOIN book b ON b.id = bg.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
				GROUP BY g.id
			) t
		`);
		return (result.rows[0]?.count as number) ?? 0;
	}
}

export const genreRepository = new GenreRepository();
