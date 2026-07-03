import { db } from "@nanahoshi-v2/db";
import { author } from "@nanahoshi-v2/db/schema/general";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../_shared/library-scope";
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
	// Upsert a LOCAL author by name. select → insert onConflictDoNothing → re-select
	// handles the race where another worker inserts the same name concurrently.
	async upsertByName(name: string, serverId: string): Promise<number> {
		const [existing] = await db
			.select({ id: author.id })
			.from(author)
			.where(
				and(
					eq(author.serverId, serverId),
					eq(author.name, name),
					eq(author.provider, "LOCAL"),
				),
			)
			.limit(1);

		if (existing) return existing.id;

		const [inserted] = await db
			.insert(author)
			.values({ name, provider: "LOCAL", serverId })
			.onConflictDoNothing()
			.returning({ id: author.id });

		if (inserted) return inserted.id;

		const [retry] = await db
			.select({ id: author.id })
			.from(author)
			.where(
				and(
					eq(author.serverId, serverId),
					eq(author.name, name),
					eq(author.provider, "LOCAL"),
				),
			)
			.limit(1);

		if (!retry) throw new Error(`Failed to upsert author "${name}"`);
		return retry.id;
	}

	// Rename/edit an author within its server. Scoped by serverId so an edit can
	// never touch another server's catalog, even with a guessed id. Clash is
	// checked against the real (server_id, name, provider) unique key.
	async rename(
		uuid: string,
		serverId: string,
		name: string,
		description?: string | null,
	): Promise<"ok" | "not_found" | "conflict"> {
		return db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: author.id, provider: author.provider })
				.from(author)
				.where(and(eq(author.uuid, uuid), eq(author.serverId, serverId)))
				.limit(1);
			if (!existing) return "not_found";

			const providerEq =
				existing.provider === null
					? sql`${author.provider} IS NULL`
					: eq(author.provider, existing.provider);
			const [clash] = await tx
				.select({ id: author.id })
				.from(author)
				.where(
					and(
						eq(author.serverId, serverId),
						eq(author.name, name),
						providerEq,
						ne(author.id, existing.id),
					),
				)
				.limit(1);
			if (clash) return "conflict";

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
	) {
		const trimmed = query?.trim();
		const result = await db.execute(sql`
			SELECT
				a.id,
				a.uuid,
				a.name,
				COUNT(DISTINCT b.id)::int AS "bookCount"
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

	async getByUuid(uuid: string, serverId: string) {
		const [row] = await db
			.select({
				uuid: author.uuid,
				name: author.name,
				description: author.description,
			})
			.from(author)
			.where(and(eq(author.serverId, serverId), eq(author.uuid, uuid)))
			.limit(1);
		return row ?? null;
	}

	async getIdByUuid(uuid: string, serverId: string): Promise<number | null> {
		const [row] = await db
			.select({ id: author.id })
			.from(author)
			.where(and(eq(author.serverId, serverId), eq(author.uuid, uuid)))
			.limit(1);
		return row?.id ?? null;
	}

	/**
	 * Average Amazon rating across an author's rated ebooks in this server, plus
	 * how many of their books are rated. Audiobooks carry no rating, so only
	 * book_metadata contributes. `average` is null when nothing is rated.
	 */
	async getRatingStatsByUuid(uuid: string, serverId?: string) {
		const result = await db.execute(
			ratingStatsQuery(
				sql`FROM author a
					INNER JOIN book_author ba ON ba.author_id = a.id
					INNER JOIN book b ON b.id = ba.book_id`,
				sql`a.uuid = ${uuid}`,
				serverId,
			),
		);
		return parseRatingStats(result.rows);
	}

	async count(serverId?: string) {
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
		`);
		const rows = result.rows as CountRow[];
		return rows[0]?.count ?? 0;
	}
}

export const authorRepository = new AuthorRepository();
