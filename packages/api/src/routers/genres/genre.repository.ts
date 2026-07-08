import { db } from "@nanahoshi-v2/db";
import { genre } from "@nanahoshi-v2/db/schema/general";
import { and, eq, type SQL, sql } from "drizzle-orm";
import {
	accessiblePredicateSql,
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";

export type GenreSort = "name" | "books" | "recent";

const ORDER_BY: Record<GenreSort, SQL> = {
	name: sql`g.name ASC`,
	books: sql`"bookCount" DESC, g.name ASC`,
	recent: sql`g.created_at DESC NULLS LAST, g.name ASC`,
};

type GenreWithCountRow = {
	id: number;
	uuid: string;
	name: string;
	bookCount: number;
	cover: string | null;
};

type CountRow = { count: number };

export class GenreRepository {
	// Upsert a genre by name. select → insert onConflictDoNothing → re-select
	// handles the race where another worker inserts the same name concurrently.
	async upsertByName(name: string, serverId: string): Promise<number> {
		const [existing] = await db
			.select({ id: genre.id })
			.from(genre)
			.where(and(eq(genre.serverId, serverId), eq(genre.name, name)))
			.limit(1);

		if (existing) return existing.id;

		const [inserted] = await db
			.insert(genre)
			.values({ name, serverId })
			.onConflictDoNothing()
			.returning({ id: genre.id });

		if (inserted) return inserted.id;

		const [retry] = await db
			.select({ id: genre.id })
			.from(genre)
			.where(and(eq(genre.serverId, serverId), eq(genre.name, name)))
			.limit(1);

		if (!retry) throw new Error(`Failed to upsert genre "${name}"`);
		return retry.id;
	}

	async listWithBookCount(
		serverId?: string,
		limit = 30,
		offset = 0,
		sort: GenreSort = "name",
		query?: string,
		scope: LibraryScope = "ALL",
	) {
		const filters: SQL[] = [visibleBookSql("b")];
		if (serverId) filters.push(sql`l.server_id = ${serverId}`);
		if (query) filters.push(sql`g.name ILIKE ${`%${query}%`}`);
		const scopePredicate = accessiblePredicateSql(scope);
		if (scopePredicate) filters.push(scopePredicate);
		const whereSql = filters.length
			? sql`WHERE ${sql.join(filters, sql` AND `)}`
			: sql``;

		const result = await db.execute(sql`
			SELECT
				g.id,
				g.uuid,
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
							${serverId ? sql`AND l2.server_id = ${serverId}` : sql``}
							${accessibleSql(scope, "b2")}
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

		const rows = result.rows as GenreWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			bookCount: row.bookCount,
			cover: row.cover,
		}));
	}

	async getByUuid(uuid: string, serverId: string, scope: LibraryScope = "ALL") {
		const [row] = (
			await db.execute(sql`
			SELECT g.uuid, g.name
			FROM genre g
			WHERE g.server_id = ${serverId}
				AND g.uuid = ${uuid}
				AND EXISTS (
					SELECT 1
					FROM book_genre bg
					INNER JOIN book b ON b.id = bg.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE bg.genre_id = g.id
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
			SELECT COUNT(*)::int AS count FROM (
				SELECT g.id
				FROM genre g
				INNER JOIN book_genre bg ON bg.genre_id = g.id
				INNER JOIN book b ON b.id = bg.book_id
				INNER JOIN library l ON l.id = b.library_id
					WHERE ${visibleBookSql("b")}
						${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
						${accessibleSql(scope)}
					GROUP BY g.id
			) t
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const genreRepository = new GenreRepository();
