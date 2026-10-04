import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/**
 * Credit order for author lists: writers (role "Author", or no role) before
 * illustrators and other contributors. Cards show only the first name, so
 * without this a light novel reads as "abec +1" instead of its author.
 */
export function authorRoleRank(role: SQLWrapper): SQL<number> {
	return sql<number>`CASE WHEN ${role} IS NULL OR ${role} = 'Author' THEN 0 ELSE 1 END`;
}

/** The same order for raw SQL, given the link table's alias (`ba`, `aa`). */
export function authorOrderBy(linkAlias: string, nameColumn = "a.name") {
	return sql.raw(
		`CASE WHEN ${linkAlias}.role IS NULL OR ${linkAlias}.role = 'Author' THEN 0 ELSE 1 END, ${nameColumn}`,
	);
}
