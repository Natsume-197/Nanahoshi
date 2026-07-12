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
	bookMediaType: "ebook" | "audiobook";
	authors: { uuid: string; name: string }[] | null;
};

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
	return sql`
		JOIN LATERAL (
			SELECT b.id, b.uuid, b.filename, l.media_type,
				COALESCE(bm.title, am.title) AS title,
				COALESCE(bm.cover, am.cover) AS cover
			FROM book b
			JOIN library l ON l.id = b.library_id
			LEFT JOIN book_series bs ON bs.book_id = b.id AND x.kind = 'series' AND bs.series_id = x.item_id
			LEFT JOIN audiobook_series as2 ON as2.book_id = b.id AND x.kind = 'series' AND as2.series_id = x.item_id
			LEFT JOIN book_metadata bm ON bm.book_id = b.id
			LEFT JOIN audiobook_metadata am ON am.book_id = b.id
			LEFT JOIN reading_progress rp ON rp.book_id = b.id AND rp.user_id = ${userId}
			LEFT JOIN listening_progress lp ON lp.book_id = b.id AND lp.user_id = ${userId}
			WHERE l.server_id = ${serverId}
				AND ${visibleBookSql("b")}
				${accessibleSql(scope, "b")}
				${formatSql(format)}
				AND (
					(x.kind = 'book' AND b.id = x.item_id)
					OR (x.kind = 'series' AND (bs.series_id IS NOT NULL OR as2.series_id IS NOT NULL))
				)
			ORDER BY
				(COALESCE(rp.status, '') = 'completed' OR COALESCE(lp.status, '') = 'completed') ASC,
				COALESCE(bs.position, as2.position) ASC NULLS LAST,
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
	rb.media_type AS "bookMediaType",
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
		// per-mix limit applied after permission filtering (headroom by design)
		const seen = new Map<number, number>();
		return rows.filter((r) => {
			const count = seen.get(r.mixIndex ?? 0) ?? 0;
			if (count >= perMixLimit) return false;
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
		const result = await db.execute(sql`
			SELECT ${itemSelectSql},
				x.score,
				'popular' AS reason,
				NULL AS "reasonTitle"
			FROM (
				SELECT wp.kind, wp.item_id, wp.score
				FROM work_popularity wp
				WHERE wp.server_id = ${serverId}
			) x
			${representativeLateral(serverId, userId, scope, format)}
			ORDER BY x.score DESC, x.item_id ASC
			LIMIT ${limit}
		`);
		return result.rows as unknown as RepresentativeRow[];
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
