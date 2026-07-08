import { db } from "@nanahoshi-v2/db";
import { publisher } from "@nanahoshi-v2/db/schema/general";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import {
	accessiblePredicateSql,
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";

export type PublisherSort = "name" | "books" | "recent";

const ORDER_BY: Record<PublisherSort, SQL> = {
	name: sql`p.name ASC`,
	books: sql`"bookCount" DESC, p.name ASC`,
	recent: sql`p.created_at DESC NULLS LAST, p.name ASC`,
};

type PublisherWithCountRow = {
	id: number;
	uuid: string;
	name: string;
	bookCount: number;
	cover: string | null;
};

type CountRow = { count: number };

export class PublisherRepository {
	// Rename a publisher within its server. Scoped by serverId so an edit can
	// never touch another server's catalog, even with a guessed id.
	async rename(
		uuid: string,
		serverId: string,
		name: string,
	): Promise<"ok" | "not_found" | "conflict"> {
		return db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: publisher.id })
				.from(publisher)
				.where(and(eq(publisher.uuid, uuid), eq(publisher.serverId, serverId)))
				.limit(1);
			if (!existing) return "not_found";

			const [clash] = await tx
				.select({ id: publisher.id })
				.from(publisher)
				.where(
					and(
						eq(publisher.serverId, serverId),
						eq(publisher.name, name),
						ne(publisher.id, existing.id),
					),
				)
				.limit(1);
			if (clash) return "conflict";

			await tx
				.update(publisher)
				.set({ name })
				.where(
					and(eq(publisher.id, existing.id), eq(publisher.serverId, serverId)),
				);
			return "ok";
		});
	}

	async getByUuid(uuid: string, serverId: string, scope: LibraryScope = "ALL") {
		const [row] = (
			await db.execute(sql`
			SELECT p.uuid, p.name
			FROM publisher p
			WHERE p.server_id = ${serverId}
				AND p.uuid = ${uuid}
				AND EXISTS (
					SELECT 1
					FROM book_metadata bm
					INNER JOIN book b ON b.id = bm.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE bm.publisher_id = p.id
						AND ${visibleBookSql("b")}
						AND l.server_id = ${serverId}
						${accessibleSql(scope)}
				)
			LIMIT 1
		`)
		).rows as Array<{ uuid: string; name: string }>;
		return row ?? null;
	}

	async listWithBookCount(
		serverId?: string,
		limit = 30,
		offset = 0,
		sort: PublisherSort = "name",
		query?: string,
		scope: LibraryScope = "ALL",
	) {
		const filters: SQL[] = [visibleBookSql("b")];
		if (serverId) filters.push(sql`l.server_id = ${serverId}`);
		if (query) filters.push(sql`p.name ILIKE ${`%${query}%`}`);
		const scopePredicate = accessiblePredicateSql(scope);
		if (scopePredicate) filters.push(scopePredicate);
		const whereSql = filters.length
			? sql`WHERE ${sql.join(filters, sql` AND `)}`
			: sql``;

		const result = await db.execute(sql`
			SELECT
				p.id,
				p.uuid,
				p.name,
				COUNT(DISTINCT b.id)::int AS "bookCount",
				(
					SELECT bm2.cover
					FROM book_metadata bm2
					INNER JOIN book b2 ON b2.id = bm2.book_id
					INNER JOIN library l2 ON l2.id = b2.library_id
					WHERE bm2.publisher_id = p.id
							AND bm2.cover IS NOT NULL
							AND ${visibleBookSql("b2")}
							${serverId ? sql`AND l2.server_id = ${serverId}` : sql``}
							${accessibleSql(scope, "b2")}
						LIMIT 1
					) AS cover
			FROM publisher p
			INNER JOIN book_metadata bm ON bm.publisher_id = p.id
			INNER JOIN book b ON b.id = bm.book_id
			INNER JOIN library l ON l.id = b.library_id
			${whereSql}
			GROUP BY p.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		const rows = result.rows as PublisherWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			bookCount: row.bookCount,
			cover: row.cover,
		}));
	}

	async count(serverId?: string, scope: LibraryScope = "ALL") {
		const result = await db.execute(sql`
			SELECT COUNT(*)::int AS count FROM (
				SELECT p.id
				FROM publisher p
				INNER JOIN book_metadata bm ON bm.publisher_id = p.id
				INNER JOIN book b ON b.id = bm.book_id
				INNER JOIN library l ON l.id = b.library_id
					WHERE ${visibleBookSql("b")}
						${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
						${accessibleSql(scope)}
					GROUP BY p.id
			) t
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const publisherRepository = new PublisherRepository();
