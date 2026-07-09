import { book } from "@nanahoshi-v2/db/schema/general";
import { inArray, type SQL, sql } from "drizzle-orm";

/** Libraries a caller may view: explicit ids, or "ALL" (no restriction). */
export type LibraryScope = number[] | "ALL";

/** Drizzle condition for accessible libraries; undefined = no filter. */
export function accessibleCondition(scope?: LibraryScope): SQL | undefined {
	if (scope === "ALL") return undefined;
	// Fail closed: an undefined or empty scope must match NOTHING, not everything.
	// (An absent scope reaching here means the caller resolved to no access.)
	if (!scope || scope.length === 0) return sql`false`;
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

/** Raw-SQL variant of {@link accessibleCondition} for `db.execute`. */
export function accessibleSql(scope?: LibraryScope, alias = "b"): SQL {
	const predicate = accessiblePredicateSql(scope, alias);
	return predicate ? sql`AND ${predicate}` : sql``;
}

/** Bare raw-SQL predicate for accessible libraries; undefined = no restriction. */
export function accessiblePredicateSql(
	scope?: LibraryScope,
	alias = "b",
): SQL | undefined {
	if (!scope || scope === "ALL") return undefined;
	if (scope.length === 0) return sql`false`;
	return sql`${sql.raw(alias)}.library_id IN (${sql.join(
		scope.map((id) => sql`${id}`),
		sql`, `,
	)})`;
}
