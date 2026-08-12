import { db } from "@nanahoshi-v2/db";
import { sql } from "drizzle-orm";
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

export type TagSort = FacetSort;
export type TagMediaType = FacetMediaType;

const TAG_FACET: FacetDefinition = {
	table: sql`tag`,
	linkColumn: sql`tag_id`,
	links: { ebook: sql`book_tag`, audiobook: sql`audiobook_tag` },
};

type CountRow = { count: number };

export class TagRepository {
	async listWithBookCount(
		serverId?: string,
		limit = 30,
		offset = 0,
		sort: TagSort = "name",
		query?: string,
		scope: LibraryScope = "ALL",
		mediaType: TagMediaType = "all",
	) {
		const result = await db.execute(
			facetListQuery(TAG_FACET, {
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
			SELECT t.uuid, t.name
			FROM tag t
			WHERE t.server_id = ${serverId}
				AND t.uuid = ${uuid}
				AND EXISTS (
					SELECT 1
					FROM (
						SELECT tag_id, book_id FROM book_tag
						UNION ALL
						SELECT tag_id, book_id FROM audiobook_tag
					) lk
					INNER JOIN book b ON b.id = lk.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE lk.tag_id = t.id
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
		mediaType: TagMediaType = "all",
	) {
		const result = await db.execute(
			facetCountQuery(TAG_FACET, { serverId, scope, mediaType }),
		);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const tagRepository = new TagRepository();
