import { type SQL, sql } from "drizzle-orm";
import {
	accessiblePredicateSql,
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "./library-scope";

/**
 * Genres and tags are the same thing to the catalog: a named facet a book is
 * linked to, listed as tiles with a count and one representative cover. This
 * module states that shape once — the query builders and the artwork pick —
 * so the two repositories are only their table names.
 */
export type FacetSort = "name" | "books" | "recent";
export type FacetMediaType = "ebook" | "audiobook";

export type FacetDefinition = {
	/** Base table (`genre`, `tag`). */
	table: SQL;
	/** The facet's id column on the link tables (`genre_id`, `tag_id`). */
	linkColumn: SQL;
	/** Link table per media type. Formats are a facet, never mixed. */
	links: Record<FacetMediaType, SQL>;
};

export type FacetRow = {
	id: number;
	uuid: string;
	name: string;
	bookCount: number;
	covers: string[] | null;
	colors: (string | null)[] | null;
};

export type FacetListOptions = {
	serverId?: string;
	limit: number;
	offset: number;
	sort: FacetSort;
	query?: string;
	scope: LibraryScope;
	mediaType: FacetMediaType;
};

const METADATA: Record<FacetMediaType, SQL> = {
	ebook: sql`book_metadata`,
	audiobook: sql`audiobook_metadata`,
};

const ORDER_BY: Record<FacetSort, SQL> = {
	name: sql`f.name ASC`,
	books: sql`"bookCount" DESC, f.name ASC`,
	recent: sql`f.created_at DESC NULLS LAST, f.name ASC`,
};

/**
 * Covers offered per facet. Only one is shown; the rest are alternates for
 * {@link pickFacetArtwork} to fall back on when a neighbouring tile took the
 * same book. Every extra candidate is a row the LATERAL fetches per page row.
 */
const ARTWORK_CANDIDATES = 6;

/**
 * One page of facets with their book count and cover candidates.
 *
 * Pages first, then hydrates: the candidates are gathered by a LATERAL over the
 * rows that survive LIMIT. As a select-list subquery the cover lookup ran once
 * per *matching* facet, before the sort.
 */
export function facetListQuery(
	facet: FacetDefinition,
	{ serverId, limit, offset, sort, query, scope, mediaType }: FacetListOptions,
): SQL {
	const filters: SQL[] = [visibleBookSql("b")];
	if (serverId) filters.push(sql`l.server_id = ${serverId}`);
	if (query) filters.push(sql`f.name ILIKE ${`%${query}%`}`);
	const scopePredicate = accessiblePredicateSql(scope);
	if (scopePredicate) filters.push(scopePredicate);

	const links = facet.links[mediaType];
	// The candidate scan only needs `library` when it filters on the server.
	const candidateLibraryJoin = serverId
		? sql`INNER JOIN library l2 ON l2.id = b2.library_id AND l2.server_id = ${serverId}`
		: sql``;

	return sql`
		SELECT
			f.id,
			f.uuid,
			f.name,
			f."bookCount",
			cov.covers,
			cov.colors
		FROM (
			SELECT
				f.id,
				f.uuid,
				f.name,
				f.created_at,
				COUNT(*)::int AS "bookCount"
			FROM ${facet.table} f
			INNER JOIN ${links} lk ON lk.${facet.linkColumn} = f.id
			INNER JOIN book b ON b.id = lk.book_id
			INNER JOIN library l ON l.id = b.library_id
			WHERE ${sql.join(filters, sql` AND `)}
			GROUP BY f.id
			ORDER BY ${ORDER_BY[sort]}
			LIMIT ${limit}
			OFFSET ${offset}
		) f
		LEFT JOIN LATERAL (
			SELECT
				array_agg(c.cover) AS covers,
				array_agg(c.main_color) AS colors
			FROM (
				SELECT md2.cover, md2.main_color
				FROM ${links} lk2
				INNER JOIN ${METADATA[mediaType]} md2 ON md2.book_id = lk2.book_id
				INNER JOIN book b2 ON b2.id = lk2.book_id
				${candidateLibraryJoin}
				WHERE lk2.${facet.linkColumn} = f.id
					AND md2.cover IS NOT NULL
					AND ${visibleBookSql("b2")}
					${accessibleSql(scope, "b2")}
				LIMIT ${ARTWORK_CANDIDATES}
			) c
		) cov ON TRUE
		ORDER BY ${ORDER_BY[sort]}
	`;
}

/** How many facets of this media type the caller can see. */
export function facetCountQuery(
	facet: FacetDefinition,
	{
		serverId,
		scope,
		mediaType,
	}: Pick<FacetListOptions, "serverId" | "scope" | "mediaType">,
): SQL {
	return sql`
		SELECT COUNT(*)::int AS count FROM (
			SELECT f.id
			FROM ${facet.table} f
			INNER JOIN ${facet.links[mediaType]} lk ON lk.${facet.linkColumn} = f.id
			INNER JOIN book b ON b.id = lk.book_id
			INNER JOIN library l ON l.id = b.library_id
			WHERE ${visibleBookSql("b")}
				${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
				${accessibleSql(scope)}
			GROUP BY f.id
		) t
	`;
}

/** Stable per-facet start offset, so a tile keeps its cover across refetches. */
function offsetFor(uuid: string): number {
	let hash = 2_166_136_261;
	for (let index = 0; index < uuid.length; index++) {
		hash ^= uuid.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

/**
 * Gives each facet one of its candidate covers, preferring one no earlier tile
 * on the page already used — neighbouring facets share their most popular
 * books, so taking the first row showed the same three covers down the page.
 * Falls back to a repeat rather than leaving a tile blank.
 */
export function pickFacetArtwork(
	rows: FacetRow[],
): Array<{ cover: string | null; mainColor: string | null }> {
	const used = new Set<string>();
	return rows.map((row) => {
		const covers = row.covers ?? [];
		if (covers.length === 0) return { cover: null, mainColor: null };
		const start = offsetFor(row.uuid) % covers.length;
		let pick = start;
		for (let step = 0; step < covers.length; step++) {
			const index = (start + step) % covers.length;
			if (!used.has(covers[index] as string)) {
				pick = index;
				break;
			}
		}
		used.add(covers[pick] as string);
		return {
			cover: covers[pick] ?? null,
			mainColor: row.colors?.[pick] ?? null,
		};
	});
}
