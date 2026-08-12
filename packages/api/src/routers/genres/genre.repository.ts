import { db } from "@nanahoshi-v2/db";
import { genre } from "@nanahoshi-v2/db/schema/general";
import { and, eq, sql } from "drizzle-orm";
import {
	type FacetDefinition,
	type FacetMediaType,
	type FacetRow,
	type FacetSort,
	facetCountQuery,
	facetListQuery,
	pickFacetArtwork,
} from "../_shared/facet-list";
import {
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";

export type GenreSort = FacetSort;
export type GenreMediaType = FacetMediaType;

const GENRE_FACET: FacetDefinition = {
	table: sql`genre`,
	linkColumn: sql`genre_id`,
	links: { ebook: sql`book_genre`, audiobook: sql`audiobook_genre` },
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
		mediaType: GenreMediaType = "all",
	) {
		const result = await db.execute(
			facetListQuery(GENRE_FACET, {
				serverId,
				limit,
				offset,
				sort,
				query,
				scope,
				mediaType,
			}),
		);

		const rows = result.rows as FacetRow[];
		const artwork = pickFacetArtwork(rows);
		return rows.map((row, index) => ({
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			bookCount: row.bookCount,
			cover: artwork[index]?.cover ?? null,
			mainColor: artwork[index]?.mainColor ?? null,
			square: artwork[index]?.square ?? false,
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
					FROM (
						SELECT genre_id, book_id FROM book_genre
						UNION ALL
						SELECT genre_id, book_id FROM audiobook_genre
					) lk
					INNER JOIN book b ON b.id = lk.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE lk.genre_id = g.id
						AND ${visibleBookSql("b")}
						AND l.server_id = ${serverId}
						${accessibleSql(scope)}
				)
			LIMIT 1
		`)
		).rows as Array<{ uuid: string; name: string }>;
		return row ?? null;
	}

	async count(
		serverId?: string,
		scope: LibraryScope = "ALL",
		mediaType: GenreMediaType = "all",
	) {
		const result = await db.execute(
			facetCountQuery(GENRE_FACET, { serverId, scope, mediaType }),
		);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const genreRepository = new GenreRepository();
