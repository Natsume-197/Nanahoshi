import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../_shared/library-scope";

export type PublisherSort = "name" | "books" | "recent";

const ORDER_BY: Record<PublisherSort, SQL> = {
	name: sql`p.name ASC`,
	books: sql`"bookCount" DESC, p.name ASC`,
	recent: sql`p.created_at DESC NULLS LAST, p.name ASC`,
};

type PublisherWithCountRow = {
	id: number;
	name: string;
	bookCount: number;
	cover: string | null;
};

type CountRow = { count: number };

export class PublisherRepository {
	async listWithBookCount(
		organizationId?: string,
		limit = 30,
		offset = 0,
		sort: PublisherSort = "name",
		query?: string,
	) {
		const filters: SQL[] = [visibleBookSql("b")];
		if (organizationId)
			filters.push(sql`l.organization_id = ${organizationId}`);
		if (query) filters.push(sql`p.name ILIKE ${`%${query}%`}`);
		const whereSql = filters.length
			? sql`WHERE ${sql.join(filters, sql` AND `)}`
			: sql``;

		const result = await db.execute(sql`
			SELECT
				p.id,
				p.name,
				COUNT(DISTINCT b.id)::int AS "bookCount",
				(
					SELECT bm2.cover
					FROM book_metadata bm2
					INNER JOIN book b2 ON b2.id = bm2.book_id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE bm2.publisher_id = p.id
						AND bm2.cover IS NOT NULL
						AND ${visibleBookSql("b2")}
						${organizationId ? sql`AND l2.organization_id = ${organizationId}` : sql``}
					LIMIT 1
				) AS cover
			FROM publisher p
			INNER JOIN book_metadata bm ON bm.publisher_id = p.id
			INNER JOIN book b ON b.id = bm.book_id
			INNER JOIN library l ON l.id = b.library_id
			${whereSql}
			GROUP BY p.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		const rows = result.rows as PublisherWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			bookCount: row.bookCount,
			cover: row.cover,
		}));
	}

	async count(organizationId?: string) {
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT p.id
				FROM publisher p
				INNER JOIN book_metadata bm ON bm.publisher_id = p.id
				INNER JOIN book b ON b.id = bm.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${organizationId ? sql`AND l.organization_id = ${organizationId}` : sql``}
				GROUP BY p.id
			) t
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const publisherRepository = new PublisherRepository();
