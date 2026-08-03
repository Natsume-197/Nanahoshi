import { db } from "@nanahoshi-v2/db";
import { series } from "@nanahoshi-v2/db/schema/general";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import {
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";
import { parseRatingStats, ratingStatsQuery } from "../_shared/rating";

export type SeriesSort = "name" | "books" | "recent" | "random";

const ORDER_BY: Record<SeriesSort, SQL> = {
	name: sql`s.name ASC`,
	books: sql`"bookCount" DESC, s.name ASC`,
	recent: sql`s.created_at DESC NULLS LAST, s.name ASC`,
	random: sql`RANDOM()`,
};

type SeriesWithCountRow = {
	id: number;
	uuid: string;
	name: string;
	aliases?: string[];
	bookCount: number;
	coverInfo: { cover: string; color: string | null } | null;
	previewCovers?: string[];
	author: { id: number; uuid: string; name: string } | null;
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
		uuid: string,
		serverId: string,
		name: string,
		description?: string | null,
	): Promise<"ok" | "not_found" | "conflict"> {
		return db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: series.id })
				.from(series)
				.where(and(eq(series.uuid, uuid), eq(series.serverId, serverId)))
				.limit(1);
			if (!existing) return "not_found";

			const [clash] = await tx
				.select({ id: series.id })
				.from(series)
				.where(
					and(
						eq(series.serverId, serverId),
						eq(series.name, name),
						ne(series.id, existing.id),
					),
				)
				.limit(1);
			if (clash) return "conflict";

			await tx
				.update(series)
				.set({ name, ...(description !== undefined ? { description } : {}) })
				.where(and(eq(series.id, existing.id), eq(series.serverId, serverId)));
			return "ok";
		});
	}

	async getByUuid(uuid: string, serverId: string, scope: LibraryScope = "ALL") {
		const [row] = (
			await db.execute(sql`
			SELECT s.uuid, s.name, s.description
			FROM series s
			WHERE s.server_id = ${serverId}
				AND s.uuid = ${uuid}
				AND EXISTS (
					SELECT 1
					FROM book_series bs
					INNER JOIN book b ON b.id = bs.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE bs.series_id = s.id
						AND ${visibleBookSql("b")}
						AND l.server_id = ${serverId}
						${accessibleSql(scope)}
				)
			LIMIT 1
		`)
		).rows as Array<{
			uuid: string;
			name: string;
			description: string | null;
		}>;
		return row ?? null;
	}

	async listWithBookCount(
		serverId?: string,
		limit = 30,
		offset = 0,
		sort: SeriesSort = "name",
		scope: LibraryScope = "ALL",
	) {
		const result = await db.execute(sql`
			SELECT
				s.id,
				s.uuid,
				s.name,
				COUNT(*)::int AS "bookCount",
				(
					SELECT jsonb_build_object('cover', bm2.cover, 'color', bm2.main_color)
					FROM book_series bs2
					INNER JOIN book b2 ON b2.id = bs2.book_id
					INNER JOIN book_metadata bm2 ON bm2.book_id = b2.id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE bs2.series_id = s.id
						AND bm2.cover IS NOT NULL
							AND ${visibleBookSql("b2")}
							${serverId ? sql`AND l2.server_id = ${serverId}` : sql``}
							${accessibleSql(scope, "b2")}
						ORDER BY bs2.position ASC NULLS LAST
					LIMIT 1
				) AS "coverInfo",
				(
					SELECT jsonb_build_object('id', a.id, 'uuid', a.uuid, 'name', a.name)
					FROM book_series bs3
					INNER JOIN book b3 ON b3.id = bs3.book_id
					INNER JOIN library l3 ON l3.id = b3.library_id
					INNER JOIN book_author ba ON ba.book_id = b3.id
					INNER JOIN author a ON a.id = ba.author_id
					WHERE bs3.series_id = s.id
							AND ${visibleBookSql("b3")}
							${serverId ? sql`AND l3.server_id = ${serverId}` : sql``}
							${accessibleSql(scope, "b3")}
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
			HAVING COUNT(*) > 1
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		const rows = result.rows as SeriesWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			bookCount: row.bookCount,
			cover: row.coverInfo?.cover ?? null,
			coverColor: row.coverInfo?.color ?? null,
			author: row.author,
		}));
	}

	async getVisibleHitByUuid(
		uuid: string,
		serverId: string,
		scope: LibraryScope = "ALL",
	) {
		const [row] = (
			await db.execute(sql`
			SELECT
				s.id,
				s.uuid,
				s.name,
				s.aliases,
				COUNT(*)::int AS "bookCount",
				(
					SELECT jsonb_build_object('cover', bm2.cover, 'color', bm2.main_color)
					FROM book_series bs2
					INNER JOIN book b2 ON b2.id = bs2.book_id
					INNER JOIN book_metadata bm2 ON bm2.book_id = b2.id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE bs2.series_id = s.id
						AND bm2.cover IS NOT NULL
						AND ${visibleBookSql("b2")}
						AND l2.server_id = ${serverId}
						${accessibleSql(scope, "b2")}
					ORDER BY bs2.position ASC NULLS LAST
					LIMIT 1
				) AS "coverInfo",
				ARRAY(
					SELECT bm3.cover
					FROM book_series bs3
					INNER JOIN book b3 ON b3.id = bs3.book_id
					INNER JOIN book_metadata bm3 ON bm3.book_id = b3.id
					INNER JOIN library l3 ON l3.id = b3.library_id
					WHERE bs3.series_id = s.id
						AND bm3.cover IS NOT NULL
						AND ${visibleBookSql("b3")}
						AND l3.server_id = ${serverId}
						${accessibleSql(scope, "b3")}
					ORDER BY bs3.position ASC NULLS LAST, b3.id ASC
					LIMIT 3
				) AS "previewCovers",
				(
					SELECT jsonb_build_object('id', a.id, 'uuid', a.uuid, 'name', a.name)
					FROM book_series bs4
					INNER JOIN book b4 ON b4.id = bs4.book_id
					INNER JOIN library l4 ON l4.id = b4.library_id
					INNER JOIN book_author ba ON ba.book_id = b4.id
					INNER JOIN author a ON a.id = ba.author_id
					WHERE bs4.series_id = s.id
						AND ${visibleBookSql("b4")}
						AND l4.server_id = ${serverId}
						${accessibleSql(scope, "b4")}
					GROUP BY a.id, a.name
					ORDER BY COUNT(*) DESC, a.name ASC
					LIMIT 1
				) AS author
			FROM series s
			INNER JOIN book_series bs ON bs.series_id = s.id
			INNER JOIN book b ON b.id = bs.book_id
			INNER JOIN library l ON l.id = b.library_id
			WHERE s.uuid = ${uuid}
				AND ${visibleBookSql("b")}
				AND l.server_id = ${serverId}
				${accessibleSql(scope)}
			GROUP BY s.id
		`)
		).rows as SeriesWithCountRow[];
		if (!row) return null;
		return {
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			aliases: row.aliases ?? [],
			bookCount: row.bookCount,
			cover: row.coverInfo?.cover ?? null,
			coverColor: row.coverInfo?.color ?? null,
			previewCovers:
				row.previewCovers ??
				(row.coverInfo?.cover ? [row.coverInfo.cover] : []),
			author: row.author,
		};
	}

	/**
	 * Average Amazon rating across a series' rated books in this server, plus how
	 * many are rated. `average` is null when nothing in the series is rated.
	 */
	async getRatingStatsByUuid(
		uuid: string,
		serverId?: string,
		scope: LibraryScope = "ALL",
	) {
		const result = await db.execute(
			ratingStatsQuery(
				sql`FROM series s
					INNER JOIN book_series bs ON bs.series_id = s.id
					INNER JOIN book b ON b.id = bs.book_id`,
				sql`s.uuid = ${uuid}`,
				serverId,
				scope,
			),
		);
		return parseRatingStats(result.rows);
	}

	async count(serverId?: string, scope: LibraryScope = "ALL") {
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT s.id
				FROM series s
				INNER JOIN book_series bs ON bs.series_id = s.id
				INNER JOIN book b ON b.id = bs.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
					${accessibleSql(scope)}
				GROUP BY s.id
				HAVING COUNT(*) > 1
			) t
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const seriesRepository = new SeriesRepository();
