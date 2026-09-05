import { db } from "@nanahoshi-v2/db";
import { author } from "@nanahoshi-v2/db/schema/general";
import { and, eq, isNull, ne, type SQL, sql } from "drizzle-orm";
import {
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";
import { normalizePersonName } from "../_shared/person-name";
import { parseRatingStats, ratingStatsQuery } from "../_shared/rating";

export type AuthorSort = "name" | "books";

const ORDER_BY: Record<AuthorSort, SQL> = {
	name: sql`a.name ASC`,
	books: sql`"bookCount" DESC, a.name ASC`,
};

interface AuthorListOptions {
	limit?: number;
	offset?: number;
	sort?: AuthorSort;
	query?: string;
}

type AuthorWithCountRow = {
	id: number;
	uuid: string;
	name: string;
	bookCount: number;
};

type CountRow = { count: number };

export class AuthorRepository {
	// Upsert an author by normalized name (any provider — the source that only
	// has a name can't distinguish identities). select → insert
	// onConflictDoNothing → re-select handles the concurrent-insert race.
	async upsertByName(name: string, serverId: string): Promise<number> {
		const nameNormalized = normalizePersonName(name);
		const byNormalized = () =>
			db
				.select({ id: author.id })
				.from(author)
				.where(
					and(
						eq(author.serverId, serverId),
						eq(author.nameNormalized, nameNormalized),
					),
				)
				.orderBy(author.id)
				.limit(1);

		const [existing] = await byNormalized();
		if (existing) return existing.id;

		const [inserted] = await db
			.insert(author)
			.values({ name, provider: "LOCAL", serverId })
			.onConflictDoNothing()
			.returning({ id: author.id });

		if (inserted) return inserted.id;

		const [retry] = await byNormalized();
		if (!retry) throw new Error(`Failed to upsert author "${name}"`);
		return retry.id;
	}

	// Rename/edit an author within its server. Scoped by serverId so an edit can
	// never touch another server's catalog, even with a guessed id. Clash is
	// checked against the (server_id, name_normalized) identity among anonymous
	// rows — renaming to the name of an ASIN-backed author is a legal homonym.
	async rename(
		uuid: string,
		serverId: string,
		name: string,
		description?: string | null,
	): Promise<"ok" | "not_found" | "conflict"> {
		return db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: author.id, amazonAsin: author.amazonAsin })
				.from(author)
				.where(and(eq(author.uuid, uuid), eq(author.serverId, serverId)))
				.limit(1);
			if (!existing) return "not_found";

			if (existing.amazonAsin === null) {
				const [clash] = await tx
					.select({ id: author.id })
					.from(author)
					.where(
						and(
							eq(author.serverId, serverId),
							eq(author.nameNormalized, normalizePersonName(name)),
							isNull(author.amazonAsin),
							ne(author.id, existing.id),
						),
					)
					.limit(1);
				if (clash) return "conflict";
			}

			await tx
				.update(author)
				.set({ name, ...(description !== undefined ? { description } : {}) })
				.where(and(eq(author.id, existing.id), eq(author.serverId, serverId)));
			return "ok";
		});
	}

	async listWithBookCount(
		serverId?: string,
		{ limit = 30, offset = 0, sort = "name", query }: AuthorListOptions = {},
		scope: LibraryScope = "ALL",
	) {
		const trimmed = query?.trim();
		const result = await db.execute(sql`
			SELECT
				a.id,
				a.uuid,
				a.name,
				COUNT(*)::int AS "bookCount"
			FROM author a
			INNER JOIN (
				SELECT ba.author_id, ba.book_id FROM book_author ba
				UNION ALL
				SELECT aa.author_id, aa.book_id FROM audiobook_author aa
			) combined ON combined.author_id = a.id
			INNER JOIN book b ON b.id = combined.book_id
			INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
					${accessibleSql(scope)}
					${trimmed ? sql`AND a.name ILIKE ${`%${trimmed}%`}` : sql``}
			GROUP BY a.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		`);

		const rows = result.rows as AuthorWithCountRow[];
		return rows.map((row) => ({
			id: row.id,
			uuid: row.uuid,
			name: row.name,
			bookCount: row.bookCount,
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
					a.id,
					a.uuid,
					a.name,
					COUNT(*)::int AS "bookCount"
				FROM author a
				INNER JOIN (
					SELECT ba.author_id, ba.book_id FROM book_author ba
					UNION ALL
					SELECT aa.author_id, aa.book_id FROM audiobook_author aa
				) combined ON combined.author_id = a.id
				INNER JOIN book b ON b.id = combined.book_id
				INNER JOIN library l ON l.id = b.library_id
				WHERE a.uuid IN (${sql.join(
					uuids.map((uuid) => sql`${uuid}`),
					sql`, `,
				)})
					AND l.server_id = ${serverId}
					AND ${visibleBookSql("b")}
					${accessibleSql(scope)}
				GROUP BY a.id
			`)
		).rows as AuthorWithCountRow[];
		const byUuid = new Map(rows.map((row) => [row.uuid, row]));
		return uuids.flatMap((uuid) => {
			const row = byUuid.get(uuid);
			return row ? [row] : [];
		});
	}

	async getByUuid(uuid: string, serverId: string, scope: LibraryScope = "ALL") {
		const [row] = (
			await db.execute(sql`
			SELECT a.uuid, a.name, a.description
			FROM author a
			WHERE a.server_id = ${serverId}
				AND a.uuid = ${uuid}
				AND EXISTS (
					SELECT 1
					FROM (
						SELECT ba.author_id, ba.book_id FROM book_author ba
						UNION ALL
						SELECT aa.author_id, aa.book_id FROM audiobook_author aa
					) combined
					INNER JOIN book b ON b.id = combined.book_id
					INNER JOIN library l ON l.id = b.library_id
					WHERE combined.author_id = a.id
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

	/**
	 * Average Amazon rating across an author's rated ebooks in this server, plus
	 * how many of their books are rated. Audiobooks carry no rating, so only
	 * book_metadata contributes. `average` is null when nothing is rated.
	 */
	async getRatingStatsByUuid(
		uuid: string,
		serverId?: string,
		scope: LibraryScope = "ALL",
	) {
		const result = await db.execute(
			ratingStatsQuery(
				sql`FROM author a
						INNER JOIN book_author ba ON ba.author_id = a.id
						INNER JOIN book b ON b.id = ba.book_id`,
				sql`a.uuid = ${uuid}`,
				serverId,
				scope,
			),
		);
		return parseRatingStats(result.rows);
	}

	async count(serverId?: string, scope: LibraryScope = "ALL") {
		const result = await db.execute(sql`
				SELECT COUNT(DISTINCT a.id)::int AS count
			FROM author a
			INNER JOIN (
				SELECT ba.author_id, ba.book_id FROM book_author ba
				UNION ALL
				SELECT aa.author_id, aa.book_id FROM audiobook_author aa
			) combined ON combined.author_id = a.id
			INNER JOIN book b ON b.id = combined.book_id
			INNER JOIN library l ON l.id = b.library_id
				WHERE ${visibleBookSql("b")}
					${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
					${accessibleSql(scope)}
			`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const authorRepository = new AuthorRepository();
