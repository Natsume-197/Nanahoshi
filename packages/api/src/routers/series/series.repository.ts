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

type SeriesSharePreviewRow = {
	title: string;
	description: string | null;
	covers: string[];
	authors: string[];
};

type SeriesSharePreview = SeriesSharePreviewRow & { cover: string | null };

export class SeriesRepository {
	async getServerId(uuid: string): Promise<string | null> {
		const [row] = await db
			.select({ serverId: series.serverId })
			.from(series)
			.where(eq(series.uuid, uuid))
			.limit(1);
		return row?.serverId ?? null;
	}

	/** Series metadata scoped to the media type encoded by the shared URL. */
	async getSharePreview(
		uuid: string,
		serverId: string,
		mediaType: "ebook" | "audiobook",
	): Promise<SeriesSharePreview | null> {
		const relation =
			mediaType === "audiobook" ? "audiobook_series" : "book_series";
		const metadata =
			mediaType === "audiobook" ? "audiobook_metadata" : "book_metadata";
		const authorRelation =
			mediaType === "audiobook" ? "audiobook_author" : "book_author";
		const result = await db.execute(sql`
			SELECT
				s.name AS title,
				s.description,
				ARRAY(
					SELECT md.cover
					FROM ${sql.raw(relation)} sr_cover
					INNER JOIN book b_cover ON b_cover.id = sr_cover.book_id
					INNER JOIN library l_cover ON l_cover.id = b_cover.library_id
					INNER JOIN ${sql.raw(metadata)} md ON md.book_id = b_cover.id
					WHERE sr_cover.series_id = s.id
						AND l_cover.server_id = ${serverId}
						AND l_cover.media_type = ${mediaType}
						AND ${visibleBookSql("b_cover")}
						AND md.cover IS NOT NULL
					ORDER BY sr_cover.position ASC NULLS LAST, b_cover.id ASC
					LIMIT 3
				) AS covers,
				(
					SELECT COALESCE(jsonb_agg(author_name ORDER BY author_name), '[]')
					FROM (
						SELECT DISTINCT a.name AS author_name
						FROM ${sql.raw(relation)} sr_author
						INNER JOIN book b_author ON b_author.id = sr_author.book_id
						INNER JOIN library l_author ON l_author.id = b_author.library_id
						INNER JOIN ${sql.raw(authorRelation)} ar ON ar.book_id = b_author.id
						INNER JOIN author a ON a.id = ar.author_id
						WHERE sr_author.series_id = s.id
							AND l_author.server_id = ${serverId}
							AND l_author.media_type = ${mediaType}
							AND ${visibleBookSql("b_author")}
					) series_authors
				) AS authors
			FROM series s
			WHERE s.uuid = ${uuid}
				AND s.server_id = ${serverId}
				AND EXISTS (
					SELECT 1
					FROM ${sql.raw(relation)} sr_exists
					INNER JOIN book b_exists ON b_exists.id = sr_exists.book_id
					INNER JOIN library l_exists ON l_exists.id = b_exists.library_id
					WHERE sr_exists.series_id = s.id
						AND l_exists.server_id = ${serverId}
						AND l_exists.media_type = ${mediaType}
						AND ${visibleBookSql("b_exists")}
				)
			LIMIT 1
		`);
		const row = result.rows[0] as SeriesSharePreviewRow | undefined;
		if (!row) return null;
		return {
			...row,
			covers: row.covers ?? [],
			cover: row.covers?.[0] ?? null,
		};
	}

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
		return (
			(await this.getVisibleHitsByUuids([uuid], serverId, scope))[0] ?? null
		);
	}

	async getVisibleHitsByUuids(
		uuids: string[],
		serverId: string,
		scope: LibraryScope = "ALL",
	) {
		if (uuids.length === 0) return [];
		const rows = (
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
			WHERE s.uuid IN (${sql.join(
				uuids.map((uuid) => sql`${uuid}`),
				sql`, `,
			)})
				AND ${visibleBookSql("b")}
				AND l.server_id = ${serverId}
				${accessibleSql(scope)}
			GROUP BY s.id
		`)
		).rows as SeriesWithCountRow[];
		const byUuid = new Map(rows.map((row) => [row.uuid, row]));
		return uuids.flatMap((uuid) => {
			const row = byUuid.get(uuid);
			if (!row) return [];
			return [
				{
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
				},
			];
		});
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
