import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";

export type NarratorSort = "name" | "books";

const ORDER_BY: Record<NarratorSort, SQL> = {
	name: sql`n.name ASC`,
	books: sql`"audiobookCount" DESC, n.name ASC`,
};

interface NarratorListOptions {
	limit?: number;
	offset?: number;
	sort?: NarratorSort;
	query?: string;
}

export class NarratorRepository {
	private buildWhere(organizationId?: string, query?: string) {
		const filters: SQL[] = [];
		if (organizationId) {
			filters.push(sql`l.organization_id = ${organizationId}`);
		}
		const trimmed = query?.trim();
		if (trimmed) {
			filters.push(sql`n.name ILIKE ${`%${trimmed}%`}`);
		}
		return filters.length ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;
	}

	async listWithAudiobookCount(
		organizationId?: string,
		{ limit = 30, offset = 0, sort = "name", query }: NarratorListOptions = {},
	) {
		const result = await db.execute(sql`
			SELECT
				n.id,
				n.name,
				COUNT(DISTINCT b.id)::int AS "audiobookCount"
			FROM narrator n
			INNER JOIN book_narrator bn ON bn.narrator_id = n.id
			INNER JOIN book b ON b.id = bn.book_id
			INNER JOIN library l ON l.id = b.library_id
			${this.buildWhere(organizationId, query)}
			GROUP BY n.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		return result.rows.map((row) => ({
			id: row.id as number,
			name: row.name as string,
			audiobookCount: row.audiobookCount as number,
		}));
	}

	async count(organizationId?: string) {
		const result = await db.execute(sql`
			SELECT COUNT(DISTINCT n.id)::int AS count
			FROM narrator n
			INNER JOIN book_narrator bn ON bn.narrator_id = n.id
			INNER JOIN book b ON b.id = bn.book_id
			INNER JOIN library l ON l.id = b.library_id
			${organizationId ? sql`WHERE l.organization_id = ${organizationId}` : sql``}
		`);
		return (result.rows[0]?.count as number) ?? 0;
	}
}

export const narratorRepository = new NarratorRepository();
