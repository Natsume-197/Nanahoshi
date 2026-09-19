import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

export const normalizeNameSearchQuery = (value: string) =>
	value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "");

export const normalizeCatalogSearchQuery = (value: string) =>
	value
		.normalize("NFKC")
		.replace(/[\s\-‐‑‒–—―−─・·=]+/gu, " ")
		.trim();

/** Lightweight normalized matching for the small, non-catalog name tables. */
export const normalizedNameSearchSql = (
	column: SQLWrapper,
	query: string,
): SQL => {
	const normalized = normalizeNameSearchQuery(query);
	if (!normalized) return sql`false`;
	return sql`regexp_replace(lower(normalize(${column}, NFKC)), '[^[:alnum:]]+', '', 'g') LIKE ${`%${normalized}%`}`;
};
