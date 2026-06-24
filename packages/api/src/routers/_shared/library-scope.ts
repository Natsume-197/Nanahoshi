import { book } from "@nanahoshi-v2/db/schema/general";
import { inArray, type SQL, sql } from "drizzle-orm";

/** Libraries a caller may view: explicit ids, or "ALL" (no restriction). */
export type LibraryScope = number[] | "ALL";

/** Drizzle condition for accessible libraries; undefined = no filter. */
export function accessibleCondition(scope?: LibraryScope): SQL | undefined {
	if (!scope || scope === "ALL") return undefined;
	return inArray(book.libraryId, scope);
}

/**
 * Bare predicate (no `AND`/`WHERE`) excluding hidden duplicate copies, for raw
 * `db.execute` queries. Hidden copies are folded behind their canonical, so any
 * book listing or aggregate (counts, covers) must filter them out. Pass the book
 * alias used in the query; callers prefix `AND`/`WHERE` as needed.
 */
export function visibleBookSql(alias = "b"): SQL {
	return sql.raw(`${alias}.duplicate_of_book_id IS NULL`);
}

/** Raw-SQL variant of {@link accessibleCondition} for `db.execute` (book alias must be `b`). */
export function accessibleSql(scope?: LibraryScope): SQL {
	if (!scope || scope === "ALL") return sql``;
	if (scope.length === 0) return sql`AND false`;
	return sql`AND b.library_id IN (${sql.join(
		scope.map((id) => sql`${id}`),
		sql`, `,
	)})`;
}
