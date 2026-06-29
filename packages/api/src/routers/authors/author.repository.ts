import { db } from "@nanahoshi-v2/db";
import { author } from "@nanahoshi-v2/db/schema/general";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "../_shared/library-scope";

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
		id: number,
		serverId: string,
		name: string,
		description?: string | null,
	): Promise<"ok" | "not_found" | "conflict"> {
		return db.transaction(async (tx) => {
			const [existing] = await tx
				.select({ id: author.id, provider: author.provider })
				.from(author)
				.where(and(eq(author.id, id), eq(author.serverId, serverId)))
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
						ne(author.id, id),
					),
				)
				.limit(1);
			if (clash) return "conflict";

			await tx
				.update(author)
				.set({ name, ...(description !== undefined ? { description } : {}) })
				.where(and(eq(author.id, id), eq(author.serverId, serverId)));
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
			name: row.name,
			bookCount: row.bookCount,
		}));
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
