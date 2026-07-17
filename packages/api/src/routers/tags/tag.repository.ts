import { db } from "@nanahoshi-v2/db";
import { type SQL, sql } from "drizzle-orm";
import {
	accessiblePredicateSql,
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";

export type TagSort = "name" | "books" | "recent";
export type TagMediaType = "ebook" | "audiobook";

const ORDER_BY: Record<TagSort, SQL> = {
	name: sql`t.name ASC`,
	books: sql`"bookCount" DESC, t.name ASC`,
	recent: sql`t.created_at DESC NULLS LAST, t.name ASC`,
};

// Formats are a facet, never mixed: list/count scope to one format's join
// table. Only getByUuid spans both (the detail page owns its format filter).
function tagLinks(mediaType: TagMediaType): SQL {
	return mediaType === "audiobook" ? sql`audiobook_tag` : sql`book_tag`;
}

function tagMetadata(mediaType: TagMediaType): SQL {
	return mediaType === "audiobook"
		? sql`audiobook_metadata`
		: sql`book_metadata`;
}

type TagWithCountRow = {
	id: number;
	uuid: string;
	name: string;
	bookCount: number;
	cover: string | null;
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
		mediaType: TagMediaType = "ebook",
	) {
		const filters: SQL[] = [visibleBookSql("b")];
		if (serverId) filters.push(sql`l.server_id = ${serverId}`);
		if (query) filters.push(sql`t.name ILIKE ${`%${query}%`}`);
		const scopePredicate = accessiblePredicateSql(scope);
		if (scopePredicate) filters.push(scopePredicate);
		const whereSql = filters.length
			? sql`WHERE ${sql.join(filters, sql` AND `)}`
			: sql``;

		const links = tagLinks(mediaType);
		const metadata = tagMetadata(mediaType);

		const result = await db.execute(sql`
			SELECT
				t.id,
				t.uuid,
				t.name,
				COUNT(*)::int AS "bookCount",
				(
					SELECT md2.cover
					FROM ${links} lk2
					INNER JOIN ${metadata} md2 ON md2.book_id = lk2.book_id
					INNER JOIN book b2 ON b2.id = lk2.book_id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE lk2.tag_id = t.id
							AND md2.cover IS NOT NULL
							AND ${visibleBookSql("b2")}
							${serverId ? sql`AND l2.server_id = ${serverId}` : sql``}
							${accessibleSql(scope, "b2")}
						LIMIT 1
					) AS cover
			FROM tag t
			INNER JOIN ${links} lk ON lk.tag_id = t.id
			INNER JOIN book b ON b.id = lk.book_id
			INNER JOIN library l ON l.id = b.library_id
			${whereSql}
			GROUP BY t.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		const rows = result.rows as TagWithCountRow[];
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
		mediaType: TagMediaType = "ebook",
	) {
		const links = tagLinks(mediaType);
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT t.id
				FROM tag t
				INNER JOIN ${links} lk ON lk.tag_id = t.id
				INNER JOIN book b ON b.id = lk.book_id
				INNER JOIN library l ON l.id = b.library_id
					WHERE ${visibleBookSql("b")}
						${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
						${accessibleSql(scope)}
					GROUP BY t.id
			) t
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const tagRepository = new TagRepository();
