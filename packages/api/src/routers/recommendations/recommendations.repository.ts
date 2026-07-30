import { db } from "@nanahoshi-v2/db";
import { userRecommendationFeedback } from "@nanahoshi-v2/db/schema/recommendations";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { WorkKind } from "../../modules/recommendations/types";
import {
	accessibleSql,
	type LibraryScope,
	visibleBookSql,
} from "../_shared/library-scope";
import type { RecommendationFormat } from "./recommendations.model";

export type ContinueSeriesRow = {
	seriesUuid: string;
	seriesName: string;
	nextPosition: string | number | null;
	lastAt: string;
	bookUuid: string;
	bookTitle: string | null;
	bookFilename: string;
	bookCover: string | null;
	bookMainColor: string | null;
	bookMediaType: "ebook" | "audiobook";
	authors: { uuid: string; name: string }[] | null;
};

export type RepresentativeRow = {
	kind: WorkKind;
	itemId: string | number;
	score: number;
	reason: string;
	reasonTitle: string | null;
	mixIndex?: number;
	rank?: number;
	seriesUuid: string | null;
	seriesName: string | null;
	bookUuid: string;
	bookTitle: string | null;
	bookFilename: string;
	bookCover: string | null;
	bookMainColor: string | null;
	bookMediaType: "ebook" | "audiobook";
	authors: { uuid: string; name: string }[] | null;
	// the shown volume is already completed by the user (resolved live)
	representativeCompleted: boolean;
};

// Headroom over perMixLimit so the online re-rank has rows to re-cap against
// after dropping consumed/dismissed items.
const MIX_OVERFETCH = 3;

function formatSql(format: RecommendationFormat): SQL {
	if (format === "books") return sql`AND l.media_type = 'ebook'`;
	if (format === "audiobooks") return sql`AND l.media_type = 'audiobook'`;
	return sql``;
}

/**
 * Picks the representative volume of a work (`x.kind`, `x.item_id`) for a user:
 * accessible, visible, format-matching member books, preferring not-completed
 * ones by series position ("next unread volume"). A work with no accessible
 * representative yields no row — fail closed, and never volume 7 of an
 * unstarted series.
 */
function representativeLateral(
	serverId: string,
	userId: string,
	scope: LibraryScope,
	format: RecommendationFormat,
): SQL {
	// Candidate book ids resolve from the work id first (indexed lookups on
	// book_series/audiobook_series or the book id itself) — the old shape scanned
	// every book in the server once per LATERAL invocation.
	return sql`
		JOIN LATERAL (
			SELECT b.id, b.uuid, b.filename, l.media_type,
				COALESCE(bm.title, am.title) AS title,
				COALESCE(bm.cover, am.cover) AS cover,
				COALESCE(bm.main_color, am.main_color) AS main_color,
				(COALESCE(rp.status, '') = 'completed' OR COALESCE(lp.status, '') = 'completed') AS completed
			FROM (
				SELECT x.item_id AS book_id, NULL::double precision AS position WHERE x.kind = 'book'
				UNION ALL
				SELECT bs.book_id, bs.position FROM book_series bs WHERE x.kind = 'series' AND bs.series_id = x.item_id
				UNION ALL
				SELECT as2.book_id, as2.position FROM audiobook_series as2 WHERE x.kind = 'series' AND as2.series_id = x.item_id
			) cand
			JOIN book b ON b.id = cand.book_id
			JOIN library l ON l.id = b.library_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN audiobook_metadata am ON am.book_id = b.id
			LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = ${userId}
			LEFT JOIN listening_progress lp ON lp.book_id = b.id AND lp.user_id = ${userId}
			WHERE l.server_id = ${serverId}
				AND ${visibleBookSql("b")}
				${accessibleSql(scope, "b")}
				${formatSql(format)}
			ORDER BY
				(COALESCE(rp.status, '') = 'completed' OR COALESCE(lp.status, '') = 'completed') ASC,
				cand.position ASC NULLS LAST,
				b.created_at ASC, b.id ASC
			LIMIT 1
		) rb ON true
	`;
}

/** Title of a referenced work, only if the caller can access at least one of its books. */
function accessibleWorkTitleLateral(
	serverId: string,
	scope: LibraryScope,
	kindExpr: string,
	idExpr: string,
	alias: string,
): SQL {
	const kind = sql.raw(kindExpr);
	const id = sql.raw(idExpr);
	return sql`
		LEFT JOIN LATERAL (
			SELECT COALESCE(s.name, bm2.title, b2.filename) AS title
			FROM (SELECT 1) one
			LEFT JOIN series s ON ${kind} = 'series' AND s.id = ${id}
			LEFT JOIN book b2 ON ${kind} = 'book' AND b2.id = ${id}
			LEFT JOIN book_metadata bm2 ON bm2.book_id = b2.id
			WHERE ${id} IS NOT NULL AND EXISTS (
				SELECT 1 FROM book bb
				JOIN library ll ON ll.id = bb.library_id
				LEFT JOIN book_series bs3 ON bs3.book_id = bb.id
				LEFT JOIN audiobook_series as3 ON as3.book_id = bb.id
				WHERE ll.server_id = ${serverId}
					AND ${visibleBookSql("bb")}
					${accessibleSql(scope, "bb")}
					AND (
						(${kind} = 'book' AND bb.id = ${id})
						OR (${kind} = 'series' AND (bs3.series_id = ${id} OR as3.series_id = ${id}))
					)
			)
		) ${sql.raw(alias)} ON true
	`;
}

const itemSelectSql = sql`
	x.kind,
	x.item_id AS "itemId",
	rb.uuid AS "bookUuid",
	rb.title AS "bookTitle",
	rb.filename AS "bookFilename",
	rb.cover AS "bookCover",
	rb.main_color AS "bookMainColor",
	rb.media_type AS "bookMediaType",
	COALESCE(rb.completed, false) AS "representativeCompleted",
	(SELECT s.uuid FROM series s WHERE x.kind = 'series' AND s.id = x.item_id) AS "seriesUuid",
	(SELECT s.name FROM series s WHERE x.kind = 'series' AND s.id = x.item_id) AS "seriesName",
	(SELECT json_agg(json_build_object('uuid', an.uuid, 'name', an.name) ORDER BY an.name) FROM (
		SELECT DISTINCT a.uuid, a.name FROM book_author ba JOIN author a ON a.id = ba.author_id WHERE ba.book_id = rb.id
		UNION SELECT a.uuid, a.name FROM audiobook_author aa JOIN author a ON a.id = aa.author_id WHERE aa.book_id = rb.id
	) an) AS authors
`;

export class RecommendationsRepository {
	async listMixHeaders(
		serverId: string,
		userId: string,
		scope: LibraryScope,
	): Promise<
		{ mixIndex: number; anchorTitle: string | null; hasAnchor: boolean }[]
	> {
		const result = await db.execute(sql`
			SELECT um.mix_index AS "mixIndex",
				anchor_ref.title AS "anchorTitle",
				(um.anchor_id IS NOT NULL) AS "hasAnchor"
			FROM user_mix um
			${accessibleWorkTitleLateral(serverId, scope, "um.anchor_kind", "um.anchor_id", "anchor_ref")}
			WHERE um.server_id = ${serverId} AND um.user_id = ${userId}
			ORDER BY um.mix_index
		`);
		return result.rows as unknown as {
			mixIndex: number;
			anchorTitle: string | null;
			hasAnchor: boolean;
		}[];
	}

	async listMixItems(
		serverId: string,
		userId: string,
		scope: LibraryScope,
		format: RecommendationFormat,
		perMixLimit: number,
	): Promise<RepresentativeRow[]> {
		const result = await db.execute(sql`
			SELECT ${itemSelectSql},
				x.mix_index AS "mixIndex",
				x.rank,
				x.score,
				x.reason,
				reason_ref.title AS "reasonTitle"
			FROM (
				SELECT ur.kind, ur.item_id, ur.mix_index, ur.rank, ur.score, ur.reason,
					ur.reason_kind, ur.reason_id
				FROM user_recommendation ur
				WHERE ur.server_id = ${serverId} AND ur.user_id = ${userId}
			) x
			${representativeLateral(serverId, userId, scope, format)}
			${accessibleWorkTitleLateral(serverId, scope, "x.reason_kind", "x.reason_id", "reason_ref")}
			ORDER BY x.mix_index, x.rank
		`);
		const rows = result.rows as unknown as RepresentativeRow[];
		// Over-fetch: the online re-rank drops consumed/dismissed rows, so keep
		// headroom above perMixLimit for it to re-cap against (service applies the
		// real perMixLimit). Headroom is also intentional for permission filtering.
		const cap = perMixLimit * MIX_OVERFETCH;
		const seen = new Map<number, number>();
		return rows.filter((r) => {
			const count = seen.get(r.mixIndex ?? 0) ?? 0;
			if (count >= cap) return false;
			seen.set(r.mixIndex ?? 0, count + 1);
			return true;
		});
	}

	async listSimilar(
		serverId: string,
		userId: string,
		scope: LibraryScope,
		seed: { kind: WorkKind; id: number },
		format: RecommendationFormat,
		limit: number,
	): Promise<RepresentativeRow[]> {
		const result = await db.execute(sql`
			SELECT ${itemSelectSql},
				x.score,
				x.reason,
				seed_ref.title AS "reasonTitle"
			FROM (
				SELECT its.cand_kind AS kind, its.cand_id AS item_id,
					its.score + 0.05 * COALESCE(wp.score, 0) AS score,
					its.reason,
					its.seed_kind, its.seed_id
				FROM item_similarity its
				LEFT JOIN work_popularity wp ON wp.server_id = its.server_id
					AND wp.kind = its.cand_kind AND wp.item_id = its.cand_id
				WHERE its.server_id = ${serverId}
					AND its.seed_kind = ${seed.kind}::work_kind AND its.seed_id = ${seed.id}
			) x
			${representativeLateral(serverId, userId, scope, format)}
			${accessibleWorkTitleLateral(serverId, scope, "x.seed_kind", "x.seed_id", "seed_ref")}
			ORDER BY x.score DESC, x.item_id ASC
			LIMIT ${limit}
		`);
		return result.rows as unknown as RepresentativeRow[];
	}

	async topPopular(
		serverId: string,
		userId: string,
		scope: LibraryScope,
		format: RecommendationFormat,
		limit: number,
	): Promise<RepresentativeRow[]> {
		// The representative LATERAL is an inner join, so it both resolves the
		// display volume AND filters out works with no visible/accessible/
		// format-matching book. Ordering (score DESC, item_id ASC) depends only on
		// work_popularity, so pre-limit to the top-N via the score index before the
		// expensive lateral — otherwise it runs once per popular work (O(all works),
		// the whole point of the row-count blowup). Overscan gives headroom for
		// works the lateral drops; wider for single-format views, which discard the
		// other media_type wholesale.
		const overscan = Math.max(limit * (format === "all" ? 4 : 8), 60);
		const result = await db.execute(sql`
			SELECT ${itemSelectSql},
				x.score,
				'popular' AS reason,
				NULL AS "reasonTitle"
			FROM (
				SELECT wp.kind, wp.item_id, wp.score
				FROM work_popularity wp
				WHERE wp.server_id = ${serverId}
				ORDER BY wp.score DESC, wp.item_id ASC
				LIMIT ${overscan}
			) x
			${representativeLateral(serverId, userId, scope, format)}
			ORDER BY x.score DESC, x.item_id ASC
			LIMIT ${limit}
		`);
		return result.rows as unknown as RepresentativeRow[];
	}

	/**
	 * Deterministic "continue the series" rail: series where the user's furthest
	 * volume (by series position) is completed — via reading/listening progress or
	 * an explicit shelf "completed" — and a later volume exists that they haven't
	 * started or shelved as completed. Gated by shelves and feedback:
	 * - a started next volume never surfaces (it lives in Continue Reading), which
	 *   also keeps abandoned-mid-volume series out;
	 * - series marked "not interested" are hidden entirely.
	 * Ordered by the recency of the user's last completion in the series.
	 */
	async listContinueSeries(
		serverId: string,
		userId: string,
		scope: LibraryScope,
		format: RecommendationFormat,
		limit: number,
	): Promise<ContinueSeriesRow[]> {
		const notInterestedSql = (seriesIdExpr: string) => sql`
			NOT EXISTS (
				SELECT 1 FROM user_recommendation_feedback urf
				WHERE urf.server_id = ${serverId} AND urf.user_id = ${userId}
					AND urf.kind = 'series' AND urf.item_id = ${sql.raw(seriesIdExpr)}
					AND urf.type = 'not_interested'
			)
		`;
		const authorsSql = sql`
			(SELECT json_agg(json_build_object('uuid', an.uuid, 'name', an.name) ORDER BY an.name) FROM (
				SELECT DISTINCT a2.uuid, a2.name FROM book_author ba JOIN author a2 ON a2.id = ba.author_id WHERE ba.book_id = nxt.id
				UNION SELECT a2.uuid, a2.name FROM audiobook_author aa JOIN author a2 ON a2.id = aa.author_id WHERE aa.book_id = nxt.id
			) an) AS authors
		`;

		const ebookBranch = sql`
			SELECT s.uuid AS "seriesUuid", s.name AS "seriesName",
				nxt.position AS "nextPosition", anch.last_at AS "lastAt",
				nxt.uuid AS "bookUuid", nxt.title AS "bookTitle",
				nxt.filename AS "bookFilename", nxt.cover AS "bookCover",
				nxt.main_color AS "bookMainColor",
				nxt.media_type AS "bookMediaType", ${authorsSql}
			FROM (
				SELECT c.series_id, max(c.position) AS last_pos, max(c.at) AS last_at
				FROM (
					SELECT bs.series_id, bs.position,
						coalesce(rp.completed_at, rp.last_read_at, rp.created_at) AS at
					FROM reading_progress rp
					JOIN book b0 ON b0.id = rp.book_id
					JOIN library l0 ON l0.id = b0.library_id
					JOIN book canon ON canon.id = coalesce(b0.duplicate_of_book_id, b0.id)
					JOIN book_series bs ON bs.book_id = canon.id
					WHERE l0.server_id = ${serverId} AND rp.user_id = ${userId}
						AND rp.status = 'completed' AND bs.position IS NOT NULL
					UNION ALL
					SELECT bs.series_id, bs.position, ubs.updated_at
					FROM user_book_shelf ubs
					JOIN book b0 ON b0.id = ubs.book_id
					JOIN library l0 ON l0.id = b0.library_id
					JOIN book canon ON canon.id = coalesce(b0.duplicate_of_book_id, b0.id)
					JOIN book_series bs ON bs.book_id = canon.id
					WHERE l0.server_id = ${serverId} AND ubs.user_id = ${userId}
						AND ubs.status = 'completed' AND bs.position IS NOT NULL
				) c
				GROUP BY c.series_id
			) anch
			JOIN series s ON s.id = anch.series_id
			JOIN LATERAL (
				SELECT b.id, b.uuid, b.filename, l.media_type, bm.title, bm.cover, bm.main_color, bs2.position
				FROM book_series bs2
				JOIN book b ON b.id = bs2.book_id
				JOIN library l ON l.id = b.library_id
				LEFT JOIN book_metadata bm ON bm.book_id = b.id
				WHERE bs2.series_id = anch.series_id AND bs2.position > anch.last_pos
					AND l.server_id = ${serverId}
					AND ${visibleBookSql("b")}
					${accessibleSql(scope, "b")}
					AND NOT EXISTS (
						SELECT 1 FROM reading_progress rp2
						WHERE rp2.book_id = b.id AND rp2.user_id = ${userId}
							AND (rp2.status <> 'unread' OR coalesce(rp2.explored_char_count, 0) > 0)
					)
					AND NOT EXISTS (
						SELECT 1 FROM user_book_shelf ubs2
						WHERE ubs2.book_id = b.id AND ubs2.user_id = ${userId}
							AND ubs2.status = 'completed'
					)
				ORDER BY bs2.position ASC, b.created_at ASC, b.id ASC
				LIMIT 1
			) nxt ON true
			WHERE ${notInterestedSql("anch.series_id")}
		`;

		const audiobookBranch = sql`
			SELECT s.uuid AS "seriesUuid", s.name AS "seriesName",
				nxt.position AS "nextPosition", anch.last_at AS "lastAt",
				nxt.uuid AS "bookUuid", nxt.title AS "bookTitle",
				nxt.filename AS "bookFilename", nxt.cover AS "bookCover",
				nxt.main_color AS "bookMainColor",
				nxt.media_type AS "bookMediaType", ${authorsSql}
			FROM (
				SELECT c.series_id, max(c.position) AS last_pos, max(c.at) AS last_at
				FROM (
					SELECT abs2.series_id, abs2.position,
						coalesce(lp.completed_at, lp.last_listened_at, lp.created_at) AS at
					FROM listening_progress lp
					JOIN book b0 ON b0.id = lp.book_id
					JOIN library l0 ON l0.id = b0.library_id
					JOIN book canon ON canon.id = coalesce(b0.duplicate_of_book_id, b0.id)
					JOIN audiobook_series abs2 ON abs2.book_id = canon.id
					WHERE l0.server_id = ${serverId} AND lp.user_id = ${userId}
						AND lp.status = 'completed' AND abs2.position IS NOT NULL
					UNION ALL
					SELECT abs2.series_id, abs2.position, uas.updated_at
					FROM user_audiobook_shelf uas
					JOIN book b0 ON b0.id = uas.book_id
					JOIN library l0 ON l0.id = b0.library_id
					JOIN book canon ON canon.id = coalesce(b0.duplicate_of_book_id, b0.id)
					JOIN audiobook_series abs2 ON abs2.book_id = canon.id
					WHERE l0.server_id = ${serverId} AND uas.user_id = ${userId}
						AND uas.status = 'completed' AND abs2.position IS NOT NULL
				) c
				GROUP BY c.series_id
			) anch
			JOIN series s ON s.id = anch.series_id
			JOIN LATERAL (
				SELECT b.id, b.uuid, b.filename, l.media_type, am.title, am.cover, am.main_color, abs3.position
				FROM audiobook_series abs3
				JOIN book b ON b.id = abs3.book_id
				JOIN library l ON l.id = b.library_id
				LEFT JOIN audiobook_metadata am ON am.book_id = b.id
				WHERE abs3.series_id = anch.series_id AND abs3.position > anch.last_pos
					AND l.server_id = ${serverId}
					AND ${visibleBookSql("b")}
					${accessibleSql(scope, "b")}
					AND NOT EXISTS (
						SELECT 1 FROM listening_progress lp2
						WHERE lp2.book_id = b.id AND lp2.user_id = ${userId}
							AND (lp2.status <> 'unstarted' OR coalesce(lp2.current_time_seconds, 0) > 0)
					)
					AND NOT EXISTS (
						SELECT 1 FROM user_audiobook_shelf uas2
						WHERE uas2.book_id = b.id AND uas2.user_id = ${userId}
							AND uas2.status = 'completed'
					)
				ORDER BY abs3.position ASC, b.created_at ASC, b.id ASC
				LIMIT 1
			) nxt ON true
			WHERE ${notInterestedSql("anch.series_id")}
		`;

		const branches: SQL[] = [];
		if (format !== "audiobooks") branches.push(ebookBranch);
		if (format !== "books") branches.push(audiobookBranch);

		// "all" can yield the same series in both formats — keep the most recent
		const result = await db.execute(sql`
			SELECT * FROM (
				SELECT DISTINCT ON (t."seriesUuid") t.*
				FROM (${sql.join(branches, sql` UNION ALL `)}) t
				ORDER BY t."seriesUuid", t."lastAt" DESC
			) d
			ORDER BY d."lastAt" DESC, d."seriesUuid" ASC
			LIMIT ${limit}
		`);
		return result.rows as unknown as ContinueSeriesRow[];
	}

	/** Maps a book to its recommendation work: its series when linked, else itself. */
	async resolveWorkForBook(
		serverId: string,
		bookUuid: string,
	): Promise<{ kind: WorkKind; id: number } | null> {
		const result = await db.execute(sql`
			SELECT
				CASE WHEN COALESCE(bs.series_id, as2.series_id) IS NOT NULL THEN 'series' ELSE 'book' END AS kind,
				COALESCE(bs.series_id, as2.series_id, canon.id) AS id
			FROM book b
			JOIN library l ON l.id = b.library_id
			JOIN book canon ON canon.id = COALESCE(b.duplicate_of_book_id, b.id)
			LEFT JOIN book_series bs ON bs.book_id = canon.id
			LEFT JOIN audiobook_series as2 ON as2.book_id = canon.id
			WHERE b.uuid = ${bookUuid} AND l.server_id = ${serverId}
			LIMIT 1
		`);
		const row = result.rows[0] as
			| { kind: WorkKind; id: string | number }
			| undefined;
		return row ? { kind: row.kind, id: Number(row.id) } : null;
	}

	/**
	 * Works the user explicitly marked "not interested". Written synchronously by
	 * setNotInterested but only removed from user_recommendation on the debounced
	 * refresh — serving reads this to hide them in the meantime. Bounded by the
	 * user's dismiss count (small), so no pool scoping is needed.
	 */
	async loadDismissedWorks(
		serverId: string,
		userId: string,
	): Promise<Set<string>> {
		const rows = await db
			.select({
				kind: userRecommendationFeedback.kind,
				itemId: userRecommendationFeedback.itemId,
			})
			.from(userRecommendationFeedback)
			.where(
				and(
					eq(userRecommendationFeedback.serverId, serverId),
					eq(userRecommendationFeedback.userId, userId),
					eq(userRecommendationFeedback.type, "not_interested"),
				),
			);
		return new Set(rows.map((r) => `${r.kind}:${Number(r.itemId)}`));
	}

	/**
	 * The user's most recent positive engagement, collapsed to works. Seeds the
	 * session boost — recency decay downweights old reads, so no hard time cutoff
	 * is needed. Bounded by `limit`. Shelf placements count too (mirroring the
	 * batch pipeline, where every shelf status is a positive signal): marking a
	 * book completed/want-to-read from the shelf leans the feed immediately, not
	 * only after the debounced refresh.
	 */
	async loadRecentPositiveSeeds(
		serverId: string,
		userId: string,
		limit: number,
	): Promise<{ kind: WorkKind; itemId: number; atMs: number }[]> {
		const result = await db.execute(sql`
			WITH events AS (
				SELECT lb.book_id, extract(epoch from lb.created_at) * 1000 AS at
				FROM liked_book lb
				WHERE lb.server_id = ${serverId} AND lb.user_id = ${userId}
				UNION ALL
				SELECT rp.book_id,
					extract(epoch from coalesce(rp.completed_at, rp.last_read_at, rp.created_at)) * 1000
				FROM reading_progress rp
				JOIN book b ON b.id = rp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND rp.user_id = ${userId}
					AND (rp.status = 'completed' OR coalesce(rp.explored_char_count, 0) > 0)
				UNION ALL
				SELECT lp.book_id,
					extract(epoch from coalesce(lp.completed_at, lp.last_listened_at, lp.created_at)) * 1000
				FROM listening_progress lp
				JOIN book b ON b.id = lp.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND lp.user_id = ${userId}
					AND (lp.status = 'completed' OR coalesce(lp.current_time_seconds, 0) > 0)
				UNION ALL
				SELECT ubs.book_id, extract(epoch from ubs.updated_at) * 1000
				FROM user_book_shelf ubs
				JOIN book b ON b.id = ubs.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND ubs.user_id = ${userId}
				UNION ALL
				SELECT uas.book_id, extract(epoch from uas.updated_at) * 1000
				FROM user_audiobook_shelf uas
				JOIN book b ON b.id = uas.book_id JOIN library l ON l.id = b.library_id
				WHERE l.server_id = ${serverId} AND uas.user_id = ${userId}
			)
			SELECT
				CASE WHEN COALESCE(bs.series_id, as2.series_id) IS NOT NULL THEN 'series' ELSE 'book' END AS kind,
				COALESCE(bs.series_id, as2.series_id, canon.id) AS "itemId",
				max(e.at) AS "atMs"
			FROM events e
			JOIN book b0 ON b0.id = e.book_id
			JOIN book canon ON canon.id = COALESCE(b0.duplicate_of_book_id, b0.id)
			LEFT JOIN book_series bs ON bs.book_id = canon.id
			LEFT JOIN audiobook_series as2 ON as2.book_id = canon.id
			GROUP BY 1, 2
			ORDER BY "atMs" DESC
			LIMIT ${limit}
		`);
		return (
			result.rows as unknown as {
				kind: WorkKind;
				itemId: string | number;
				atMs: string | number;
			}[]
		).map((r) => ({
			kind: r.kind,
			itemId: Number(r.itemId),
			atMs: Number(r.atMs),
		}));
	}

	/** Precomputed similarities from the given seed works to their candidates. */
	async loadSeedSimilarities(
		serverId: string,
		seeds: { kind: WorkKind; itemId: number }[],
	): Promise<
		{
			seedKind: WorkKind;
			seedId: number;
			candKind: WorkKind;
			candId: number;
			score: number;
		}[]
	> {
		if (seeds.length === 0) return [];
		const result = await db.execute(sql`
			SELECT seed_kind AS "seedKind", seed_id AS "seedId",
				cand_kind AS "candKind", cand_id AS "candId", score
			FROM item_similarity
			WHERE server_id = ${serverId}
				AND (seed_kind, seed_id) IN (${sql.join(
					seeds.map((s) => sql`(${s.kind}::work_kind, ${s.itemId})`),
					sql`, `,
				)})
		`);
		return (
			result.rows as unknown as {
				seedKind: WorkKind;
				seedId: string | number;
				candKind: WorkKind;
				candId: string | number;
				score: string | number;
			}[]
		).map((r) => ({
			seedKind: r.seedKind,
			seedId: Number(r.seedId),
			candKind: r.candKind,
			candId: Number(r.candId),
			score: Number(r.score),
		}));
	}

	async resolveSeriesId(
		serverId: string,
		seriesUuid: string,
	): Promise<number | null> {
		const result = await db.execute(sql`
			SELECT s.id FROM series s WHERE s.uuid = ${seriesUuid} AND s.server_id = ${serverId} LIMIT 1
		`);
		const row = result.rows[0] as { id: string | number } | undefined;
		return row ? Number(row.id) : null;
	}

	async addNotInterested(
		serverId: string,
		userId: string,
		work: { kind: WorkKind; id: number },
	): Promise<void> {
		await db
			.insert(userRecommendationFeedback)
			.values({
				serverId,
				userId,
				kind: work.kind,
				itemId: work.id,
				type: "not_interested",
			})
			.onConflictDoNothing();
	}

	async removeNotInterested(
		serverId: string,
		userId: string,
		work: { kind: WorkKind; id: number },
	): Promise<void> {
		await db
			.delete(userRecommendationFeedback)
			.where(
				and(
					eq(userRecommendationFeedback.serverId, serverId),
					eq(userRecommendationFeedback.userId, userId),
					eq(userRecommendationFeedback.kind, work.kind),
					eq(userRecommendationFeedback.itemId, work.id),
				),
			);
	}
}

export const recommendationsRepository = new RecommendationsRepository();
