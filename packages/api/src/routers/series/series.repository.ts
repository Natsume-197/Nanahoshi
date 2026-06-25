import { db } from "@nanahoshi-v2/db";
import { series } from "@nanahoshi-v2/db/schema/general";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../_shared/library-scope";

export type SeriesSort = "name" | "books" | "recent";

const ORDER_BY: Record<SeriesSort, SQL> = {
	name: sql`s.name ASC`,
	books: sql`"bookCount" DESC, s.name ASC`,
	recent: sql`s.created_at DESC NULLS LAST, s.name ASC`,
};

type SeriesWithCountRow = {
	id: number;
	name: string;
	bookCount: number;
	cover: string | null;
	author: { id: number; name: string } | null;
};

type CountRow = { count: number };

export class SeriesRepository {
	// Upsert a series by name. select → insert onConflictDoNothing → re-select
	// handles the race where another worker inserts the same name concurrently.
	async upsertByName(name: string, serverId: string): Promise<number> {
		const [existing] = await db
			.select({ id: series.id })
			.from(series)
			.where(and(eq(series.serverId, serverId), eq(series.name, name)))
			.limit(1);

		if (existing) return existing.id;

		const [inserted] = await db
			.insert(series)
			.values({ name, serverId })
			.onConflictDoNothing()
			.returning({ id: series.id });

		if (inserted) return inserted.id;

		const [retry] = await db
			.select({ id: series.id })
			.from(series)
			.where(and(eq(series.serverId, serverId), eq(series.name, name)))
			.limit(1);

		if (!retry) throw new Error(`Failed to upsert series "${name}"`);
		return retry.id;
	}

	// Rename/edit a series within its server. Scoped by serverId so an edit can
	// never touch another server's catalog, even with a guessed id.
	async rename(
		id: number,
		serverId: string,
		name: string,
		description?: string | null,
	): Promise<"ok" | "not_found" | "conflict"> {
		return db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: series.id })
				.from(series)
				.where(and(eq(series.id, id), eq(series.serverId, serverId)))
				.limit(1);
			if (!existing) return "not_found";

			const [clash] = await tx
				.select({ id: series.id })
				.from(series)
				.where(
					and(
						eq(series.serverId, serverId),
						eq(series.name, name),
						ne(series.id, id),
					),
				)
				.limit(1);
			if (clash) return "conflict";

			await tx
				.update(series)
				.set({ name, ...(description !== undefined ? { description } : {}) })
				.where(and(eq(series.id, id), eq(series.serverId, serverId)));
			return "ok";
		});
	}

	// Resolve a server's series by name (for the name-keyed detail page → edit).
	async getByName(name: string, serverId: string) {
		const [row] = await db
			.select({
				id: series.id,
				name: series.name,
				description: series.description,
			})
			.from(series)
			.where(and(eq(series.serverId, serverId), eq(series.name, name)))
			.limit(1);
		return row ?? null;
	}

	async listWithBookCount(
		serverId?: string,
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
						${serverId ? sql`AND l2.server_id = ${serverId}` : sql``}
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
						${serverId ? sql`AND l3.server_id = ${serverId}` : sql``}
					GROUP BY a.id, a.name
					ORDER BY COUNT(*) DESC, a.name ASC
					LIMIT 1
				) AS author
			FROM series s
			INNER JOIN book_series bs ON bs.series_id = s.id
			INNER JOIN book b ON b.id = bs.book_id
			INNER JOIN library l ON l.id = b.library_id
			WHERE ${visibleBookSql("b")}
				${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
			GROUP BY s.id
			HAVING COUNT(DISTINCT b.id) > 1
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		const rows = result.rows as SeriesWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			bookCount: row.bookCount,
			cover: row.cover,
			author: row.author,
		}));
	}

	async count(serverId?: string) {
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT s.id
				FROM series s
				INNER JOIN book_series bs ON bs.series_id = s.id
				INNER JOIN book b ON b.id = bs.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
				GROUP BY s.id
				HAVING COUNT(DISTINCT b.id) > 1
			) t
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const seriesRepository = new SeriesRepository();
