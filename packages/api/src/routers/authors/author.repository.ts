import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";

export class AuthorRepository {
	async listWithBookCount(organizationId?: string, limit = 30, offset = 0) {
		const result = await db.execute(sql`
			SELECT
				a.id,
				a.name,
				COUNT(DISTINCT b.id)::int AS "bookCount"
			FROM author a
			INNER JOIN book_author ba ON ba.author_id = a.id
			INNER JOIN book b ON b.id = ba.book_id
			INNER JOIN library l ON l.id = b.library_id
			${organizationId ? sql`WHERE l.organization_id = ${organizationId}` : sql``}
			GROUP BY a.id
			ORDER BY a.name ASC
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		return result.rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			bookCount: row.bookCount as number,
		}));
	}
}

export const authorRepository = new AuthorRepository();
