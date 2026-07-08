import { db } from "@nanahoshi-v2/db";
import { narrator } from "@nanahoshi-v2/db/schema/general";
import { and, eq, type SQL, sql } from "drizzle-orm";
import {
	accessiblePredicateSql,
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";

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
	uuid: string;
	name: string;
	audiobookCount: number;
};

type CountRow = { count: number };

export class NarratorRepository {
	// Upsert a narrator by name. select → insert onConflictDoNothing → re-select
	// handles the race where another worker inserts the same name concurrently.
	async upsertByName(name: string, serverId: string): Promise<number> {
		const [existing] = await db
			.select({ id: narrator.id })
			.from(narrator)
			.where(and(eq(narrator.serverId, serverId), eq(narrator.name, name)))
			.limit(1);

		if (existing) return existing.id;

		const [inserted] = await db
			.insert(narrator)
			.values({ name, serverId })
			.onConflictDoNothing()
			.returning({ id: narrator.id });

		if (inserted) return inserted.id;

		const [retry] = await db
			.select({ id: narrator.id })
			.from(narrator)
			.where(and(eq(narrator.serverId, serverId), eq(narrator.name, name)))
			.limit(1);

		if (!retry) throw new Error(`Failed to upsert narrator "${name}"`);
		return retry.id;
	}

	private buildWhere(
		serverId?: string,
		query?: string,
		scope: LibraryScope = "ALL",
	) {
		const filters: SQL[] = [visibleBookSql("b")];
		if (serverId) {
			filters.push(sql`l.server_id = ${serverId}`);
		}
		const scopePredicate = accessiblePredicateSql(scope);
		if (scopePredicate) filters.push(scopePredicate);
		const trimmed = query?.trim();
		if (trimmed) {
			filters.push(sql`n.name ILIKE ${`%${trimmed}%`}`);
		}
		return filters.length ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``;
	}

	async listWithAudiobookCount(
		serverId?: string,
		{ limit = 30, offset = 0, sort = "name", query }: NarratorListOptions = {},
		scope: LibraryScope = "ALL",
	) {
		const result = await db.execute(sql`
			SELECT
				n.id,
				n.uuid,
				n.name,
				COUNT(DISTINCT b.id)::int AS "audiobookCount"
			FROM narrator n
				INNER JOIN book_narrator bn ON bn.narrator_id = n.id
				INNER JOIN book b ON b.id = bn.book_id
				INNER JOIN library l ON l.id = b.library_id
				${this.buildWhere(serverId, query, scope)}
				GROUP BY n.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		const rows = result.rows as NarratorWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			audiobookCount: row.audiobookCount,
		}));
	}

	async getByUuid(uuid: string, serverId: string, scope: LibraryScope = "ALL") {
		const [row] = (
			await db.execute(sql`
			SELECT n.uuid, n.name
			FROM narrator n
			WHERE n.server_id = ${serverId}
				AND n.uuid = ${uuid}
				AND EXISTS (
					SELECT 1
					FROM book_narrator bn
					INNER JOIN book b ON b.id = bn.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE bn.narrator_id = n.id
						AND ${visibleBookSql("b")}
						AND l.server_id = ${serverId}
						${accessibleSql(scope)}
				)
			LIMIT 1
		`)
		).rows as Array<{ uuid: string; name: string }>;
		return row ?? null;
	}

	async count(serverId?: string, scope: LibraryScope = "ALL") {
		const result = await db.execute(sql`
			SELECT COUNT(DISTINCT n.id)::int AS count
			FROM narrator n
				INNER JOIN book_narrator bn ON bn.narrator_id = n.id
				INNER JOIN book b ON b.id = bn.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
					${accessibleSql(scope)}
			`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const narratorRepository = new NarratorRepository();
