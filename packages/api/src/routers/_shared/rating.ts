import { type SQL, sql } from "drizzle-orm";
import { visibleBookSql } from "./library-scope";

// How many votes the prior (the server mean) is worth. Below this many reviews a
// rating is pulled toward the mean; well above it the book's own rating dominates.
export const BAYES_PRIOR_WEIGHT = 30;

export type RatingStats = { average: number | null; ratedBooks: number };

/**
 * Average Amazon rating and rated-book count over a catalog entity's books.
 * `entitySource` is the `FROM …` chain that reaches `book b` (e.g. via
 * `book_author` or `series → book_series`); `entityMatch` selects the entity
 * (e.g. `ba.author_id = …`). Audiobooks carry no rating, so only book_metadata
 * contributes. `serverId`, when given, scopes to that server's books.
 */
export function ratingStatsQuery(
	entitySource: SQL,
	entityMatch: SQL,
	serverId?: string,
): SQL {
	return sql`
		SELECT
			AVG(bm.amazon_rating)::float AS average,
			COUNT(bm.amazon_rating)::int AS "ratedBooks"
		${entitySource}
		INNER JOIN library l ON l.id = b.library_id
		INNER JOIN book_metadata bm ON bm.book_id = b.id
		WHERE ${entityMatch}
			AND bm.amazon_rating IS NOT NULL
			AND ${visibleBookSql("b")}
			${serverId ? sql`AND l.server_id = ${serverId}` : sql``}
	`;
}

/** Normalizes a `ratingStatsQuery` result row into the public shape. */
export function parseRatingStats(rows: unknown[]): RatingStats {
	const row = rows[0] as RatingStats | undefined;
	return { average: row?.average ?? null, ratedBooks: row?.ratedBooks ?? 0 };
}

/**
 * Bayesian-weighted Amazon rating as raw SQL — `(v/(v+m))·R + (m/(v+m))·C` —
 * for queries that reference book_metadata via a table alias. Pulls sparse-vote
 * ratings toward the prior mean C so a 5.0 with 2 reviews can't outrank a 4.6
 * with thousands. Yields NULL for unrated books (callers sort them last).
 *
 * `bmAlias` is the book_metadata alias (a code-controlled literal, never user
 * input). `serverId`, when given, scopes the prior mean to that server's books.
 */
export function bayesianRatingSql(bmAlias: string, serverId?: string): SQL {
	const r = sql.raw(`${bmAlias}.amazon_rating`);
	const v = sql.raw(`COALESCE(${bmAlias}.amazon_review_count, 0)::float`);
	const m = sql`${BAYES_PRIOR_WEIGHT}::float`;
	const meanScope = serverId ? sql`AND l_avg.server_id = ${serverId}` : sql``;
	const mean = sql`(
		SELECT AVG(bm_avg.amazon_rating)
		FROM book_metadata bm_avg
		INNER JOIN book b_avg ON b_avg.id = bm_avg.book_id
		INNER JOIN library l_avg ON l_avg.id = b_avg.library_id
		WHERE bm_avg.amazon_rating IS NOT NULL ${meanScope}
	)`;
	const c = sql`COALESCE(${mean}, ${r})`;
	return sql`CASE WHEN ${r} IS NULL THEN NULL ELSE (
		(${v} / (${v} + ${m})) * ${r} + (${m} / (${v} + ${m})) * ${c}
	) END`;
}
