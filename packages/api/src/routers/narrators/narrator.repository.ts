import { db } from "@nanahoshi-v2/db";
import { narrator } from "@nanahoshi-v2/db/schema/general";
import { eq, type SQL, sql } from "drizzle-orm";

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

type NarratorWithCountRow = {
	id: number;
	name: string;
	audiobookCount: number;
};

type CountRow = { count: number };

export class NarratorRepository {
	// Upsert a narrator by name. select → insert onConflictDoNothing → re-select
	// handles the race where another worker inserts the same name concurrently.
	async upsertByName(name: string): Promise<number> {
		const [existing] = await db
			.select({ id: narrator.id })
			.from(narrator)
			.where(eq(narrator.name, name))
			.limit(1);

		if (existing) return existing.id;

		const [inserted] = await db
			.insert(narrator)
			.values({ name })
			.onConflictDoNothing()
			.returning({ id: narrator.id });

		if (inserted) return inserted.id;

		const [retry] = await db
			.select({ id: narrator.id })
			.from(narrator)
			.where(eq(narrator.name, name))
			.limit(1);

		if (!retry) throw new Error(`Failed to upsert narrator "${name}"`);
		return retry.id;
	}

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

		const rows = result.rows as NarratorWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			audiobookCount: row.audiobookCount,
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
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const narratorRepository = new NarratorRepository();
