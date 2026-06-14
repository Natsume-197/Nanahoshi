import { book } from "@nanahoshi-v2/db/schema/general";
import { inArray, type SQL, sql } from "drizzle-orm";

/** Libraries a caller may view: explicit ids, or "ALL" (no restriction). */
export type LibraryScope = number[] | "ALL";

/** Drizzle condition for accessible libraries; undefined = no filter. */
export function accessibleCondition(scope?: LibraryScope): SQL | undefined {
	if (!scope || scope === "ALL") return undefined;
	return inArray(book.libraryId, scope);
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
